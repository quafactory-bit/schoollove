import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { prepareDurableUpstreamLoginLeg } from './durable-upstream-leg'
import { createDurableProviderVerifier } from './durable-provider-verifier'
import { GOOGLE_OIDC_METADATA, KAKAO_OIDC_METADATA, NAVER_OAUTH_METADATA, type UpstreamHttpTransport } from './upstream-adapters'
import { SocialBrokerError } from './errors'

const NOW = 1_800_000_000
const attemptId = 'c1000000-0000-4000-8000-000000000001'
const legId = 'c1000000-0000-4000-8000-000000000002'
const upstream = {
  google: { clientId: 'test-only-google-upstream-client', redirectUri: 'https://broker.invalid/google/callback' },
  kakao: { clientId: 'test-only-kakao-upstream-client', redirectUri: 'https://broker.invalid/kakao/callback' },
  naver: { clientId: 'test-only-naver-upstream-client', redirectUri: 'https://broker.invalid/naver/callback' },
} as const
const key = { version: 7, material: Buffer.alloc(32, 7) }
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...(pair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'q-runtime-kid', use: 'sig', alg: 'RS256' }
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
function oidcToken(provider: 'google' | 'kakao', nonce: string, overrides: Record<string, unknown> = {}) {
  const client = upstream[provider]
  const payload = { iss: provider === 'google' ? GOOGLE_OIDC_METADATA.issuers[0] : KAKAO_OIDC_METADATA.issuer, aud: client.clientId, sub: `test-only-${provider}-subject`, iat: NOW - 1, exp: NOW + 60, auth_time: NOW - 2, nonce, ...overrides }
  const header = b64({ alg: 'RS256', kid: 'q-runtime-kid', typ: 'JWT' }); const body = b64(payload); const signed = `${header}.${body}`
  return `${signed}.${sign('RSA-SHA256', Buffer.from(signed, 'ascii'), pair.privateKey).toString('base64url')}`
}
function transport(input: Readonly<{ provider: 'google' | 'kakao'; token: string; badJwks?: boolean }>): UpstreamHttpTransport {
  return {
    exchangeCode: async request => { if (request.provider !== input.provider || request.clientId !== upstream[input.provider].clientId || request.redirectUri !== upstream[input.provider].redirectUri || !request.codeVerifier) throw new Error('SYNTHETIC_TRANSPORT_REJECTED'); return { status: 200, contentType: 'application/json', body: JSON.stringify({ id_token: input.token }), url: request.tokenEndpoint } },
    fetchJwks: async request => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ keys: input.badJwks ? [] : [jwk] }), url: request.jwksUri }),
    fetchNaverProfile: async () => { throw new Error('unused') },
  }
}

describe('durable provider verifier', () => {
  it.each(['google', 'kakao'] as const)('PHASE10O_Q_%s_DURABLE_OIDC_VERIFIER_OK', async provider => {
    const prepared = prepareDurableUpstreamLoginLeg({ attemptId, legId, provider, clientId: upstream[provider].clientId, redirectUri: upstream[provider].redirectUri, pkceKey: key })
    const verifier = createDurableProviderVerifier({ upstream, pkceKey: key, transport: transport({ provider, token: oidcToken(provider, prepared.authorization.rawNonce!) }), now: () => NOW })
    const verified = await verifier.verify({ provider, authorizationCode: 'synthetic/opaque/provider-code', rawState: prepared.authorization.rawState, attemptId, legId, nonceDigest: prepared.database.nonceDigest, pkce: { challenge: prepared.database.pkce!.challenge, ciphertext: prepared.database.pkce!.ciphertext, iv: prepared.database.pkce!.iv, keyVersion: prepared.database.pkce!.keyVersion } })
    expect(verified).toEqual({ provider, upstreamSubject: Buffer.from(`test-only-${provider}-subject`), authenticationTime: NOW - 2 })
    expect(JSON.stringify(verified)).not.toMatch(/token|code|nonce|jwks/i)
  })

  it('PHASE10O_Q_DURABLE_PROVIDER_FAILURE_FAILS_CLOSED', async () => {
    const prepared = prepareDurableUpstreamLoginLeg({ attemptId, legId, provider: 'google', clientId: upstream.google.clientId, redirectUri: upstream.google.redirectUri, pkceKey: key })
    const verifier = createDurableProviderVerifier({ upstream, pkceKey: { ...key, material: Buffer.alloc(32, 8) }, transport: transport({ provider: 'google', token: oidcToken('google', prepared.authorization.rawNonce!) }), now: () => NOW })
    let caught: unknown
    try { await verifier.verify({ provider: 'google', authorizationCode: 'synthetic/opaque/provider-code', rawState: prepared.authorization.rawState, attemptId, legId, nonceDigest: prepared.database.nonceDigest, pkce: { challenge: prepared.database.pkce!.challenge, ciphertext: prepared.database.pkce!.ciphertext, iv: prepared.database.pkce!.iv, keyVersion: prepared.database.pkce!.keyVersion } }) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(SocialBrokerError)
    expect(caught).toMatchObject({ code: 'UPSTREAM_RESPONSE_MALFORMED', diagnosticReason: 'pkce_resume_failed' })
  })

  it('classifies a missing durable nonce digest as nonce_failed before transport', async () => {
    const prepared = prepareDurableUpstreamLoginLeg({ attemptId, legId, provider: 'google', clientId: upstream.google.clientId, redirectUri: upstream.google.redirectUri, pkceKey: key })
    let transportCalls = 0
    const verifier = createDurableProviderVerifier({
      upstream,
      pkceKey: key,
      transport: {
        exchangeCode: async () => { transportCalls += 1; throw new Error('must not run') },
        fetchJwks: async () => { throw new Error('must not run') },
        fetchNaverProfile: async () => { throw new Error('must not run') },
      },
      now: () => NOW,
    })
    let caught: unknown
    try { await verifier.verify({ provider: 'google', authorizationCode: 'synthetic/opaque/provider-code', rawState: prepared.authorization.rawState, attemptId, legId, nonceDigest: null, pkce: { challenge: prepared.database.pkce!.challenge, ciphertext: prepared.database.pkce!.ciphertext, iv: prepared.database.pkce!.iv, keyVersion: prepared.database.pkce!.keyVersion } }) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(SocialBrokerError)
    expect(caught).toMatchObject({ code: 'NONCE_REJECTED', diagnosticReason: 'nonce_failed' })
    expect(transportCalls).toBe(0)
  })

  it('PHASE10O_Q_TYPED_EXPIRY_PROVENANCE_SURVIVES_DURABLE_VERIFIER', async () => {
    const prepared = prepareDurableUpstreamLoginLeg({ attemptId, legId, provider: 'google', clientId: upstream.google.clientId, redirectUri: upstream.google.redirectUri, pkceKey: key })
    const verifier = createDurableProviderVerifier({ upstream, pkceKey: key, transport: transport({ provider: 'google', token: oidcToken('google', prepared.authorization.rawNonce!, { exp: NOW - 1 }) }), now: () => NOW })
    let caught: unknown
    try { await verifier.verify({ provider: 'google', authorizationCode: 'synthetic/opaque/provider-code', rawState: prepared.authorization.rawState, attemptId, legId, nonceDigest: prepared.database.nonceDigest, pkce: { challenge: prepared.database.pkce!.challenge, ciphertext: prepared.database.pkce!.ciphertext, iv: prepared.database.pkce!.iv, keyVersion: prepared.database.pkce!.keyVersion } }) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(SocialBrokerError)
    expect((caught as SocialBrokerError).code).toBe('UPSTREAM_RESPONSE_EXPIRED')
  })

  it('PHASE10O_Q_NAVER_DURABLE_VERIFIER_OK', async () => {
    const verifier = createDurableProviderVerifier({ upstream, pkceKey: key, transport: { exchangeCode: async request => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'memory-only' }), url: request.tokenEndpoint }), fetchJwks: async () => { throw new Error('unused') }, fetchNaverProfile: async request => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ resultcode: '00', response: { id: 'test-only-naver-subject' } }), url: request.profileEndpoint }) }, now: () => NOW })
    await expect(verifier.verify({ provider: 'naver', authorizationCode: 'synthetic/opaque/provider-code', rawState: 'A'.repeat(43), attemptId, legId, nonceDigest: null, pkce: null })).resolves.toEqual({ provider: 'naver', upstreamSubject: Buffer.from('test-only-naver-subject'), authenticationTime: NOW })
  })
})
