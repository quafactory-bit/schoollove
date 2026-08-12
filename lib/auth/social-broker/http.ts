import 'server-only'
import { createHash, generateKeyPairSync, randomBytes, sign, timingSafeEqual, type KeyObject } from 'node:crypto'
import { brokerAuthorizationCodeDigest, decryptBrokerDownstreamNonce, type BrokerAuthorizationCodeNonceKey, type DurableDownstreamNonce } from './durable-code'
import { calculateS256Challenge } from './pkce'
import { isSocialProvider, type SocialProvider } from './types'

type ClientAuthMethod = 'client_secret_basic' | 'client_secret_post'
type BrokerClient = Readonly<{ clientId: string; secretDigest: Uint8Array; redirectUri: string; provider: SocialProvider }>
type ConsumedCode = Readonly<{ outcome: 'AUTHORIZATION_CODE_CONSUMED'; subject: string; authenticationTime: number; codeId: string; downstreamNonce: DurableDownstreamNonce | null }>

export type DarkOidcRegistry = Readonly<{
  clients: readonly BrokerClient[]
  nonceKey: BrokerAuthorizationCodeNonceKey
  /** Injectable only for verification that client authentication precedes code lookup. */
  digestCode?: (code: string) => Uint8Array
  /** Called only after syntax/client authentication has succeeded. */
  consumeCode(input: Readonly<{ codeDigest: Uint8Array; clientId: string; redirectUri: string; pkceS256Challenge: string }>): Promise<ConsumedCode | null>
  /** Test-only upstream/account completion; it owns durable code creation and redirect. */
  authorize(input: Readonly<{ clientId: string; provider: SocialProvider; redirectUri: string; state: string; pkceS256Challenge: string; nonce?: string }>): Promise<string>
}>

const MAX_PARAMETER_BYTES = 2048
const PROVIDER_LIKE_PARAMETERS = new Set(['provider', 'upstream_provider', 'social_provider'])
const safeError = (code: string, status = 400) => Response.json({ error: code }, { status, headers: { 'cache-control': 'no-store' } })
const exactIssuer = (issuer: string) => {
  const parsed = new URL(issuer)
  // This is a configured value injected when constructing the local harness;
  // request Host and forwarding headers are never inputs to this decision.
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('OIDC_ISSUER_INVALID')
  return issuer.replace(/\/$/, '')
}
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
const digestSecret = (secret: string) => createHash('sha256').update('schoollove:oidc-client-secret:v1\0').update(secret, 'utf8').digest()

function single(params: URLSearchParams, name: string, required = true): string | undefined {
  const values = params.getAll(name)
  if (values.length > 1 || (required && values.length !== 1) || (!required && values.length > 1)) throw new Error('invalid_request')
  const value = values[0]
  if (value !== undefined && (Buffer.byteLength(value, 'utf8') === 0 || Buffer.byteLength(value, 'utf8') > MAX_PARAMETER_BYTES)) throw new Error('invalid_request')
  return value
}
function noAmbiguity(params: URLSearchParams): void {
  const seen = new Set<string>()
  for (const [name] of params) {
    if (seen.has(name) || PROVIDER_LIKE_PARAMETERS.has(name)) throw new Error('invalid_request')
    seen.add(name)
  }
}
function parseBasic(header: string): Readonly<{ clientId: string; secret: string }> {
  if (!/^Basic\s+/i.test(header)) throw new Error('invalid_client')
  const encoded = header.replace(/^Basic\s+/i, '')
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('invalid_client')
  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  const index = decoded.indexOf(':')
  if (index < 1 || decoded.indexOf(':', index + 1) !== -1) throw new Error('invalid_client')
  try {
    const clientId = decodeURIComponent(decoded.slice(0, index).replace(/\+/g, '%20'))
    const secret = decodeURIComponent(decoded.slice(index + 1).replace(/\+/g, '%20'))
    if (!clientId || !secret) throw new Error('invalid_client')
    return { clientId, secret }
  } catch { throw new Error('invalid_client') }
}

/** Dark, server-only HTTP protocol surface. App routes intentionally never construct this in deployed runtimes. */
export class DarkOidcHttpIssuer {
  readonly issuer: string
  #registry: DarkOidcRegistry
  #privateKey: KeyObject
  #publicKey: KeyObject
  #kid = `test-${randomBytes(8).toString('hex')}`

  constructor(input: Readonly<{ issuer: string; registry: DarkOidcRegistry }>) {
    this.issuer = exactIssuer(input.issuer)
    this.#registry = input.registry
    const ids = new Set<string>()
    for (const client of input.registry.clients) {
      if (!client.clientId || ids.has(client.clientId) || !isSocialProvider(client.provider) || !client.redirectUri) throw new Error('OIDC_CLIENT_REGISTRY_INVALID')
      ids.add(client.clientId)
    }
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 })
    this.#privateKey = pair.privateKey; this.#publicKey = pair.publicKey
  }

  discovery() {
    return { issuer: this.issuer, authorization_endpoint: `${this.issuer}/oauth/authorize`, token_endpoint: `${this.issuer}/oauth/token`, jwks_uri: `${this.issuer}/.well-known/jwks.json`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], grant_types_supported: ['authorization_code'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'] }
  }
  jwks() { const jwk = this.#publicKey.export({ format: 'jwk' }) as Record<string, unknown>; return { keys: [{ ...jwk, kid: this.#kid, use: 'sig', alg: 'RS256' }] } }
  async authorizeRequest(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url); noAmbiguity(url.searchParams)
      if (single(url.searchParams, 'response_type') !== 'code') throw new Error('unsupported_response_type')
      const clientId = single(url.searchParams, 'client_id')!; const client = this.#client(clientId)
      const redirectUri = single(url.searchParams, 'redirect_uri')!; if (redirectUri !== client.redirectUri) throw new Error('invalid_request')
      const state = single(url.searchParams, 'state')!; const challenge = single(url.searchParams, 'code_challenge')!
      if (single(url.searchParams, 'code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error('invalid_request')
      if (!single(url.searchParams, 'scope')!.split(/\s+/).includes('openid')) throw new Error('invalid_scope')
      const nonce = single(url.searchParams, 'nonce', false)
      return Response.redirect(await this.#registry.authorize({ clientId, provider: client.provider, redirectUri, state, pkceS256Challenge: challenge, ...(nonce === undefined ? {} : { nonce }) }), 302)
    } catch (error) { return safeError(error instanceof Error ? error.message : 'invalid_request') }
  }
  async tokenRequest(request: Request): Promise<Response> {
    try {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) throw new Error('invalid_request')
      const body = new URLSearchParams(await request.text()); noAmbiguity(body)
      if (single(body, 'grant_type') !== 'authorization_code') throw new Error('unsupported_grant_type')
      const basic = request.headers.get('authorization'); const postId = single(body, 'client_id', false); const postSecret = single(body, 'client_secret', false)
      if ((basic !== null && (postId !== undefined || postSecret !== undefined)) || (basic === null && (postId === undefined || postSecret === undefined))) throw new Error('invalid_client')
      const supplied = basic === null ? { clientId: postId!, secret: postSecret! } : parseBasic(basic)
      const client = this.#client(supplied.clientId); if (!timingSafeEqual(digestSecret(supplied.secret), Buffer.from(client.secretDigest))) throw new Error('invalid_client')
      const code = single(body, 'code')!; const redirectUri = single(body, 'redirect_uri')!; const verifier = single(body, 'code_verifier')!
      if (redirectUri !== client.redirectUri) throw new Error('invalid_grant')
      const codeDigest = (this.#registry.digestCode ?? brokerAuthorizationCodeDigest)(code)
      const consumed = await this.#registry.consumeCode({ codeDigest, clientId: client.clientId, redirectUri, pkceS256Challenge: calculateS256Challenge(verifier) })
      if (!consumed) throw new Error('invalid_grant')
      const nonce = consumed.downstreamNonce === null ? undefined : decryptBrokerDownstreamNonce({ encrypted: consumed.downstreamNonce, key: this.#registry.nonceKey, codeId: consumed.codeId, clientId: client.clientId, redirectUri })
      const now = Math.floor(Date.now() / 1000); const payload = { iss: this.issuer, aud: client.clientId, sub: consumed.subject, iat: now, exp: now + 300, auth_time: consumed.authenticationTime, ...(nonce === undefined ? {} : { nonce }) }
      const head = b64({ alg: 'RS256', typ: 'JWT', kid: this.#kid }); const encoded = b64(payload); const idToken = `${head}.${encoded}.${sign('RSA-SHA256', Buffer.from(`${head}.${encoded}`, 'ascii'), this.#privateKey).toString('base64url')}`
      return Response.json({ access_token: randomBytes(32).toString('base64url'), token_type: 'Bearer', expires_in: 60, id_token: idToken }, { headers: { 'cache-control': 'no-store' } })
    } catch (error) { return safeError(error instanceof Error ? error.message : 'invalid_request', error instanceof Error && error.message === 'invalid_client' ? 401 : 400) }
  }
  #client(id: string) { const client = this.#registry.clients.find(value => value.clientId === id); if (!client) throw new Error('invalid_client'); return client }
}

export function createSyntheticClient(clientId: string, secret: string, redirectUri: string, provider: SocialProvider): BrokerClient { return { clientId, secretDigest: digestSecret(secret), redirectUri, provider } }
/** Routes may never be activated by environment. Local tests instantiate the issuer explicitly. */
export function darkOidcRouteNotFound(): Response { return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } }) }
