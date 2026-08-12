import 'server-only'
import { createPublicKey, verify } from 'node:crypto'
import { createNonceLeg, type NonceBinding } from './nonce'
import { calculateS256Challenge, createPkceVerifier } from './pkce'
import { createStateLeg, type StateBinding } from './state'
import { verifyDurableUpstreamNonce } from './durable-upstream-leg'
import { brokerFailure } from './errors'
import type { SocialProvider } from './types'

const MAX_RESPONSE_BYTES = 16 * 1024
const MAX_JWKS_KEYS = 16

export type UpstreamHttpResponse = Readonly<{ status: number; contentType: string; body: string; url: string }>
export type UpstreamHttpTransport = Readonly<{
  /** The transport owns future live credential custody; adapters never receive a client secret. */
  exchangeCode(input: Readonly<{ provider: SocialProvider; tokenEndpoint: string; clientId: string; redirectUri: string; authorizationCode: string; codeVerifier?: string; state?: string }>): Promise<UpstreamHttpResponse>
  fetchJwks(input: Readonly<{ provider: 'kakao' | 'google'; jwksUri: string }>): Promise<UpstreamHttpResponse>
  /** Naver's access token is request-memory-only and never returned by the adapter. */
  fetchNaverProfile(input: Readonly<{ profileEndpoint: string; accessToken: string }>): Promise<UpstreamHttpResponse>
}>

export type PreparedUpstreamAuthorization = Readonly<{ provider: SocialProvider; authorizationUrl: string }>
export type ValidatedUpstreamCallback = Readonly<{ provider: SocialProvider; authorizationCode: string }>
export type VerifiedProviderIdentity = Readonly<{ provider: SocialProvider; upstreamSubject: Uint8Array; authenticationTime?: number }>
export interface UpstreamProviderAdapter {
  readonly provider: SocialProvider
  prepareAuthorization(): PreparedUpstreamAuthorization
  validateCallback(input: Readonly<{ provider: SocialProvider; callbackUrl: string }>): ValidatedUpstreamCallback
  exchangeAndVerifyIdentity(callback: ValidatedUpstreamCallback, now: number): Promise<VerifiedProviderIdentity>
}

type OidcProviderConfig = Readonly<{
  provider: 'kakao' | 'google'
  clientId: string
  redirectUri: string
  authorizationEndpoint: string
  tokenEndpoint: string
  jwksUri: string
  issuers: readonly string[]
}>
type ClientCallbackConfig = Readonly<{ clientId: string; redirectUri: string }>
type NaverProviderConfig = Readonly<{
  provider: 'naver'
  clientId: string
  redirectUri: string
  authorizationEndpoint: string
  tokenEndpoint: string
  profileEndpoint: string
}>
type PendingLeg = Readonly<{ state: StateBinding; rawState: string; nonce?: NonceBinding; verifier?: string; callbackCode?: string; exchanged: boolean }>

export const KAKAO_OIDC_METADATA = Object.freeze({
  issuer: 'https://kauth.kakao.com',
  authorizationEndpoint: 'https://kauth.kakao.com/oauth/authorize',
  tokenEndpoint: 'https://kauth.kakao.com/oauth/token',
  jwksUri: 'https://kauth.kakao.com/.well-known/jwks.json',
})
export const GOOGLE_OIDC_METADATA = Object.freeze({
  issuers: Object.freeze(['https://accounts.google.com', 'accounts.google.com']),
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
})
export const NAVER_OAUTH_METADATA = Object.freeze({
  authorizationEndpoint: 'https://nid.naver.com/oauth2.0/authorize',
  tokenEndpoint: 'https://nid.naver.com/oauth2.0/token',
  profileEndpoint: 'https://openapi.naver.com/v1/nid/me',
})

function safeHttps(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash } catch { return false }
}
function exactJsonContentType(value: string): boolean {
  return /^application\/json(?:\s*;\s*charset\s*=\s*utf-8\s*)?$/i.test(value)
}
function parseJson(response: UpstreamHttpResponse): unknown {
  if (response.status !== 200 || !exactJsonContentType(response.contentType) || Buffer.byteLength(response.body, 'utf8') > MAX_RESPONSE_BYTES) brokerFailure('UPSTREAM_ERROR')
  try { return JSON.parse(response.body) } catch { brokerFailure('UPSTREAM_RESPONSE_MALFORMED') }
}
function parseExpectedJson(response: UpstreamHttpResponse, expectedUrl: string): unknown {
  if (response.url !== expectedUrl) brokerFailure('UPSTREAM_ERROR')
  return parseJson(response)
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  return value as Record<string, unknown>
}
function nonEmpty(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 2048) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  return value
}
function opaqueAuthorizationCode(value: string): string {
  if (Buffer.byteLength(value, 'utf8') > 2048 || /[\u0000-\u001F\u007F]/.test(value)) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  return value
}
function callbackParameters(callbackUrl: string, redirectUri: string): URLSearchParams {
  let callback: URL
  try { callback = new URL(callbackUrl) } catch { brokerFailure('UPSTREAM_RESPONSE_MALFORMED') }
  const expected = new URL(redirectUri)
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.hash) brokerFailure('PROVIDER_MISMATCH')
  return callback.searchParams
}
function single(params: URLSearchParams, name: string): string {
  const values = params.getAll(name)
  if (values.length !== 1 || !values[0]) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  return values[0]
}
function decodeJwt(token: string): Readonly<{ header: Record<string, unknown>; payload: Record<string, unknown>; signed: Buffer; signature: Buffer }> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  try {
    return Object.freeze({
      header: object(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))),
      payload: object(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))),
      signed: Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii'),
      signature: Buffer.from(parts[2], 'base64url'),
    })
  } catch { brokerFailure('UPSTREAM_RESPONSE_MALFORMED') }
}
function validateJwt(input: Readonly<{ idToken: string; provider: 'kakao' | 'google'; config: OidcProviderConfig; nonce?: NonceBinding; nonceDigest?: Uint8Array; transport: UpstreamHttpTransport; now: number }>): Promise<VerifiedProviderIdentity> {
  return (async () => {
    const jwt = decodeJwt(input.idToken)
    if (jwt.header.alg !== 'RS256' || typeof jwt.header.kid !== 'string' || !jwt.header.kid) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    const jwksResponse = await input.transport.fetchJwks({ provider: input.provider, jwksUri: input.config.jwksUri })
    const jwks = object(parseExpectedJson(jwksResponse, input.config.jwksUri)); const keys = jwks.keys
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_JWKS_KEYS) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    const key = keys.find(candidate => {
      const value = candidate as Record<string, unknown>
      return value && typeof value === 'object' && value.kid === jwt.header.kid && value.kty === 'RSA' && value.use === 'sig' && value.alg === 'RS256' && typeof value.n === 'string' && typeof value.e === 'string' && !('d' in value || 'p' in value || 'q' in value || 'dp' in value || 'dq' in value || 'qi' in value)
    }) as Record<string, unknown> | undefined
    if (!key) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    try { if (!verify('RSA-SHA256', jwt.signed, createPublicKey({ key, format: 'jwk' }), jwt.signature)) brokerFailure('UPSTREAM_RESPONSE_MALFORMED') } catch { brokerFailure('UPSTREAM_RESPONSE_MALFORMED') }
    const payload = jwt.payload
    if (typeof payload.iss !== 'string' || !input.config.issuers.includes(payload.iss) || payload.aud !== input.config.clientId) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    const exp = payload.exp; const iat = payload.iat
    if (!Number.isSafeInteger(exp) || !Number.isSafeInteger(iat)) brokerFailure('UPSTREAM_RESPONSE_EXPIRED')
    const expNumber = exp as number; const iatNumber = iat as number
    if (expNumber <= input.now || iatNumber > input.now + 30 || iatNumber > expNumber) brokerFailure('UPSTREAM_RESPONSE_EXPIRED')
    if (typeof payload.nonce !== 'string' || !(input.nonce ? input.nonce.verifyAndConsume(payload.nonce) : input.nonceDigest && verifyDurableUpstreamNonce(payload.nonce, input.nonceDigest))) brokerFailure('NONCE_REJECTED')
    const subject = nonEmpty(payload.sub)
    const authenticationTime = payload.auth_time
    if (authenticationTime !== undefined && !Number.isSafeInteger(authenticationTime)) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    const authenticationTimeNumber = authenticationTime as number | undefined
    if (authenticationTimeNumber !== undefined && (authenticationTimeNumber < 0 || authenticationTimeNumber > input.now + 30)) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    return Object.freeze({ provider: input.provider, upstreamSubject: Buffer.from(subject, 'utf8'), ...(authenticationTimeNumber === undefined ? {} : { authenticationTime: authenticationTimeNumber }) })
  })()
}

function oidcConfig(provider: 'kakao' | 'google', input: ClientCallbackConfig): OidcProviderConfig {
  if (!input.clientId || !safeHttps(input.redirectUri)) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  return provider === 'kakao'
    ? { ...input, ...KAKAO_OIDC_METADATA, provider, issuers: [KAKAO_OIDC_METADATA.issuer] }
    : { ...input, ...GOOGLE_OIDC_METADATA, provider, issuers: GOOGLE_OIDC_METADATA.issuers }
}

/** Stateless durable-resume verifier: it has no process-local pending state. */
export async function verifyResumedOidcIdentity(input: Readonly<{ provider: 'kakao' | 'google'; authorizationCode: string; clientId: string; redirectUri: string; codeVerifier: string; nonceDigest: Uint8Array; transport: UpstreamHttpTransport; now: number }>): Promise<VerifiedProviderIdentity> {
  const config = oidcConfig(input.provider, input)
  if (!input.authorizationCode || !input.codeVerifier || input.nonceDigest.byteLength !== 32) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  const response = await input.transport.exchangeCode({ provider: input.provider, tokenEndpoint: config.tokenEndpoint, clientId: config.clientId, redirectUri: config.redirectUri, authorizationCode: opaqueAuthorizationCode(input.authorizationCode), codeVerifier: input.codeVerifier })
  const token = object(parseExpectedJson(response, config.tokenEndpoint)); const idToken = nonEmpty(token.id_token)
  return validateJwt({ idToken, provider: input.provider, config, nonceDigest: input.nonceDigest, transport: input.transport, now: input.now })
}

/** Stateless Naver resume verifier. Raw callback state is request-memory token intent only. */
export async function verifyResumedNaverIdentity(input: Readonly<{ authorizationCode: string; rawState: string; clientId: string; redirectUri: string; transport: UpstreamHttpTransport }>): Promise<VerifiedProviderIdentity> {
  if (!input.clientId || !safeHttps(input.redirectUri) || !input.rawState || !input.authorizationCode) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  const token = object(parseExpectedJson(await input.transport.exchangeCode({ provider: 'naver', tokenEndpoint: NAVER_OAUTH_METADATA.tokenEndpoint, clientId: input.clientId, redirectUri: input.redirectUri, authorizationCode: opaqueAuthorizationCode(input.authorizationCode), state: input.rawState }), NAVER_OAUTH_METADATA.tokenEndpoint))
  const accessToken = nonEmpty(token.access_token)
  const profile = object(parseExpectedJson(await input.transport.fetchNaverProfile({ profileEndpoint: NAVER_OAUTH_METADATA.profileEndpoint, accessToken }), NAVER_OAUTH_METADATA.profileEndpoint))
  if (profile.resultcode !== '00') brokerFailure('UPSTREAM_ERROR')
  return Object.freeze({ provider: 'naver', upstreamSubject: Buffer.from(nonEmpty(object(profile.response).id), 'utf8') })
}

abstract class BaseAdapter<TConfig extends OidcProviderConfig | NaverProviderConfig> implements UpstreamProviderAdapter {
  readonly provider: SocialProvider
  protected readonly config: TConfig
  protected readonly transport: UpstreamHttpTransport
  #pending: PendingLeg | null = null
  constructor(config: TConfig, transport: UpstreamHttpTransport) {
    if (!config.clientId || !safeHttps(config.redirectUri) || !safeHttps(config.authorizationEndpoint) || !safeHttps(config.tokenEndpoint)) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    this.provider = config.provider; this.config = config; this.transport = transport
  }
  abstract prepareAuthorization(): PreparedUpstreamAuthorization
  abstract exchangeAndVerifyIdentity(callback: ValidatedUpstreamCallback, now: number): Promise<VerifiedProviderIdentity>
  protected createPending(input: Readonly<{ state: StateBinding; rawState: string; nonce?: NonceBinding; verifier?: string }>): void {
    if (this.#pending) brokerFailure('REPLAY_REJECTED')
    this.#pending = { ...input, exchanged: false }
  }
  validateCallback(input: Readonly<{ provider: SocialProvider; callbackUrl: string }>): ValidatedUpstreamCallback {
    if (input.provider !== this.provider || !this.#pending) brokerFailure('PROVIDER_MISMATCH')
    const params = callbackParameters(input.callbackUrl, this.config.redirectUri)
    const state = single(params, 'state')
    if (!this.#pending.state.verifyAndConsume(state)) brokerFailure('STATE_REJECTED')
    const code = opaqueAuthorizationCode(single(params, 'code'))
    this.#pending = { ...this.#pending, callbackCode: code }
    return Object.freeze({ provider: this.provider, authorizationCode: code })
  }
  protected consumeCallback(callback: ValidatedUpstreamCallback): PendingLeg {
    if (!this.#pending || this.#pending.exchanged || callback.provider !== this.provider || callback.authorizationCode !== this.#pending.callbackCode) brokerFailure('REPLAY_REJECTED')
    this.#pending = { ...this.#pending, exchanged: true }
    return this.#pending
  }
}

class OidcAdapter extends BaseAdapter<OidcProviderConfig> {
  prepareAuthorization(): PreparedUpstreamAuthorization {
    const verifier = createPkceVerifier(); const nonce = createNonceLeg(); const state = createStateLeg(); this.createPending({ state: state.binding, rawState: state.rawState, verifier, nonce: nonce.binding })
    const url = new URL(this.config.authorizationEndpoint)
    url.search = new URLSearchParams({ response_type: 'code', client_id: this.config.clientId, redirect_uri: this.config.redirectUri, scope: 'openid', state: state.rawState, nonce: nonce.rawNonce, code_challenge: calculateS256Challenge(verifier), code_challenge_method: 'S256' }).toString()
    return Object.freeze({ provider: this.provider, authorizationUrl: url.toString() })
  }
  async exchangeAndVerifyIdentity(callback: ValidatedUpstreamCallback, now: number): Promise<VerifiedProviderIdentity> {
    const pending = this.consumeCallback(callback)
    if (!pending.verifier || !pending.nonce) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    const response = await this.transport.exchangeCode({ provider: this.provider, tokenEndpoint: this.config.tokenEndpoint, clientId: this.config.clientId, redirectUri: this.config.redirectUri, authorizationCode: callback.authorizationCode, codeVerifier: pending.verifier })
    const token = object(parseExpectedJson(response, this.config.tokenEndpoint)); const idToken = nonEmpty(token.id_token)
    return validateJwt({ idToken, provider: this.provider as 'kakao' | 'google', config: this.config, nonce: pending.nonce, transport: this.transport, now })
  }
}

export class KakaoUpstreamAdapter extends OidcAdapter {
  constructor(input: ClientCallbackConfig, transport: UpstreamHttpTransport) { super(oidcConfig('kakao', input), transport) }
}
export class GoogleUpstreamAdapter extends OidcAdapter {
  constructor(input: ClientCallbackConfig, transport: UpstreamHttpTransport) { super(oidcConfig('google', input), transport) }
}

export class NaverUpstreamAdapter extends BaseAdapter<NaverProviderConfig> {
  constructor(input: ClientCallbackConfig, transport: UpstreamHttpTransport) {
    super({ ...input, ...NAVER_OAUTH_METADATA, provider: 'naver' }, transport)
  }
  prepareAuthorization(): PreparedUpstreamAuthorization {
    const stateLeg = createStateLeg(); this.createPending({ state: stateLeg.binding, rawState: stateLeg.rawState })
    const url = new URL(this.config.authorizationEndpoint)
    url.search = new URLSearchParams({ response_type: 'code', client_id: this.config.clientId, redirect_uri: this.config.redirectUri, state: stateLeg.rawState }).toString()
    return Object.freeze({ provider: 'naver', authorizationUrl: url.toString() })
  }
  async exchangeAndVerifyIdentity(callback: ValidatedUpstreamCallback, now: number): Promise<VerifiedProviderIdentity> {
    void now
    const pending = this.consumeCallback(callback)
    const token = object(parseExpectedJson(await this.transport.exchangeCode({ provider: 'naver', tokenEndpoint: this.config.tokenEndpoint, clientId: this.config.clientId, redirectUri: this.config.redirectUri, authorizationCode: callback.authorizationCode, state: pending.rawState }), this.config.tokenEndpoint))
    const accessToken = nonEmpty(token.access_token)
    const profile = object(parseExpectedJson(await this.transport.fetchNaverProfile({ profileEndpoint: this.config.profileEndpoint, accessToken }), this.config.profileEndpoint))
    if (profile.resultcode !== '00') brokerFailure('UPSTREAM_ERROR')
    const response = object(profile.response); const subject = nonEmpty(response.id)
    return Object.freeze({ provider: 'naver', upstreamSubject: Buffer.from(subject, 'utf8') })
  }
}
