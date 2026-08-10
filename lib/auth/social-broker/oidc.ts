import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto'
import { brokerFailure } from './errors'
import { calculateS256Challenge, verifyPkce } from './pkce'

export type FakeBrokerClient = Readonly<{
  clientId: string
  redirectUris: readonly string[]
}>

export type BrokerIdTokenClaims = Readonly<{
  iss: string
  aud: string
  sub: string
  iat: number
  exp: number
  auth_time: number
}>

export type FakeDiscoveryMetadata = Readonly<{
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  response_types_supported: readonly ['code']
  subject_types_supported: readonly ['public']
  id_token_signing_alg_values_supported: readonly ['EdDSA']
  grant_types_supported: readonly ['authorization_code']
  code_challenge_methods_supported: readonly ['S256']
}>

type StoredAuthorizationCode = {
  digest: string
  subject: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  issuedAt: number
  expiresAt: number
  authenticationTime: number
  consumed: boolean
}

export type FakeBrokerTokenResponse = Readonly<{
  tokenType: 'Bearer'
  expiresIn: number
  idToken: string
}>

const exactHttpsOrigin = (issuer: string): string => {
  const parsed = new URL(issuer)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
  }
  return issuer.endsWith('/') ? issuer.slice(0, -1) : issuer
}

const encodeJson = (value: unknown): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
const codeDigest = (code: string): string => createHash('sha256').update(code, 'utf8').digest('base64url')

/** Local test harness only. It does not expose HTTP routes or persist signing material. */
export class FakeBrokerOidcIssuer {
  readonly issuer: string
  readonly codeTtlSeconds = 60
  #clients = new Map<string, FakeBrokerClient>()
  #codes = new Map<string, StoredAuthorizationCode>()
  #privateKey: KeyObject
  #publicKey: KeyObject
  #kid: string

  constructor(input: Readonly<{ issuer: string; clients: readonly FakeBrokerClient[] }>) {
    this.issuer = exactHttpsOrigin(input.issuer)
    for (const client of input.clients) {
      if (!client.clientId || this.#clients.has(client.clientId) || client.redirectUris.length === 0) {
        brokerFailure('UNKNOWN_CLIENT')
      }
      this.#clients.set(client.clientId, Object.freeze({
        clientId: client.clientId,
        redirectUris: Object.freeze([...client.redirectUris]),
      }))
    }
    const pair = generateKeyPairSync('ed25519')
    this.#privateKey = pair.privateKey
    this.#publicKey = pair.publicKey
    this.#kid = `fake-${randomBytes(8).toString('hex')}`
  }

  discovery(): FakeDiscoveryMetadata {
    return Object.freeze({
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/authorize`,
      token_endpoint: `${this.issuer}/token`,
      jwks_uri: `${this.issuer}/.well-known/jwks.json`,
      response_types_supported: ['code'] as const,
      subject_types_supported: ['public'] as const,
      id_token_signing_alg_values_supported: ['EdDSA'] as const,
      grant_types_supported: ['authorization_code'] as const,
      code_challenge_methods_supported: ['S256'] as const,
    })
  }

  jwks(): Readonly<{ keys: readonly Record<string, unknown>[] }> {
    const publicJwk = this.#publicKey.export({ format: 'jwk' }) as Record<string, unknown>
    return Object.freeze({
      keys: Object.freeze([{ ...publicJwk, kid: this.#kid, use: 'sig', alg: 'EdDSA' }]),
    })
  }

  issueAuthorizationCode(input: Readonly<{
    subject: string
    clientId: string
    redirectUri: string
    codeChallenge: string
    codeChallengeMethod: 'S256' | 'plain'
    issuedAt: number
    authenticationTime: number
  }>): string {
    const client = this.#clients.get(input.clientId)
    if (!client) brokerFailure('UNKNOWN_CLIENT')
    if (!client.redirectUris.some((uri) => uri === input.redirectUri)) brokerFailure('REDIRECT_URI_REJECTED')
    if (input.codeChallengeMethod !== 'S256') brokerFailure('PKCE_DOWNGRADE_REJECTED')
    if (!input.subject.startsWith('slb:v1:')) brokerFailure('INVALID_SUBJECT')
    if (input.authenticationTime > input.issuedAt) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    const code = randomBytes(32).toString('base64url')
    const digest = codeDigest(code)
    this.#codes.set(digest, {
      digest,
      subject: input.subject,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      issuedAt: input.issuedAt,
      expiresAt: input.issuedAt + this.codeTtlSeconds,
      authenticationTime: input.authenticationTime,
      consumed: false,
    })
    return code
  }

  exchangeAuthorizationCode(input: Readonly<{
    code: string
    clientId: string
    redirectUri: string
    codeVerifier: string
    now: number
  }>): FakeBrokerTokenResponse {
    const digest = codeDigest(input.code)
    const stored = this.#codes.get(digest)
    if (!stored) brokerFailure('AUTHORIZATION_CODE_REJECTED')
    if (stored.consumed) brokerFailure('REPLAY_REJECTED')
    stored.consumed = true
    if (input.now >= stored.expiresAt) brokerFailure('AUTHORIZATION_CODE_EXPIRED')
    if (input.clientId !== stored.clientId) brokerFailure('UNKNOWN_CLIENT')
    if (input.redirectUri !== stored.redirectUri) brokerFailure('REDIRECT_URI_REJECTED')
    if (!verifyPkce(input.codeVerifier, stored.codeChallenge)) brokerFailure('PKCE_REJECTED')

    const claims: BrokerIdTokenClaims = Object.freeze({
      iss: this.issuer,
      aud: stored.clientId,
      sub: stored.subject,
      iat: input.now,
      exp: input.now + 300,
      auth_time: stored.authenticationTime,
    })
    return Object.freeze({
      tokenType: 'Bearer',
      expiresIn: 300,
      idToken: this.#signIdToken(claims),
    })
  }

  decodeIdTokenClaims(idToken: string): BrokerIdTokenClaims {
    const parts = idToken.split('.')
    if (parts.length !== 3) brokerFailure('AUTHORIZATION_CODE_REJECTED')
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as BrokerIdTokenClaims
  }

  #signIdToken(claims: BrokerIdTokenClaims): string {
    const header = encodeJson({ alg: 'EdDSA', typ: 'JWT', kid: this.#kid })
    const payload = encodeJson(claims)
    const body = `${header}.${payload}`
    const signature = sign(null, Buffer.from(body, 'ascii'), this.#privateKey).toString('base64url')
    return `${body}.${signature}`
  }
}

export function pkceChallengeForAuthorization(verifier: string): string {
  return calculateS256Challenge(verifier)
}
