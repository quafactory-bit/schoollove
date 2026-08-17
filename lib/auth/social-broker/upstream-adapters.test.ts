import { generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { SocialBrokerError } from './errors'
import { deriveBrokerSubject } from './subject'
import {
  GOOGLE_OIDC_METADATA,
  KAKAO_OIDC_METADATA,
  NAVER_OAUTH_METADATA,
  GoogleUpstreamAdapter,
  KakaoUpstreamAdapter,
  NaverUpstreamAdapter,
  verifyResumedNaverIdentity,
  verifyResumedOidcIdentity,
  type UpstreamHttpResponse,
  type UpstreamHttpTransport,
} from './upstream-adapters'

const NOW = 1_800_000_000
const redirect = 'https://broker.schoollove.invalid/callback'
const clientId = 'synthetic-client-id'
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...(keyPair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'synthetic-kid', use: 'sig', alg: 'RS256' }
const json = (body: unknown, url: string): UpstreamHttpResponse => ({ status: 200, contentType: 'application/json; charset=UTF-8', body: JSON.stringify(body), url })
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
function jwt(payload: Record<string, unknown>, input: Readonly<{ kid?: string; alg?: string; privateKey?: typeof keyPair.privateKey }> = {}): string {
  const header = b64({ alg: input.alg ?? 'RS256', kid: input.kid ?? 'synthetic-kid', typ: 'JWT' })
  const body = b64(payload); const signed = `${header}.${body}`
  return `${signed}.${sign('RSA-SHA256', Buffer.from(signed, 'ascii'), input.privateKey ?? keyPair.privateKey).toString('base64url')}`
}
function oidcTransport(input: Readonly<{ provider: 'kakao' | 'google'; idToken: string; jwksUri?: string; tokenUrl?: string; tokenContentType?: string; tokenBody?: string }>): UpstreamHttpTransport {
  return {
    exchangeCode: async request => ({ status: 200, contentType: input.tokenContentType ?? 'application/json', body: input.tokenBody ?? JSON.stringify({ id_token: input.idToken, access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token' }), url: input.tokenUrl ?? request.tokenEndpoint }),
    fetchJwks: async request => json({ keys: [jwk] }, input.jwksUri ?? request.jwksUri),
    fetchNaverProfile: async () => { throw new Error('not used') },
  }
}
function oidcConfig(provider: 'kakao' | 'google') {
  void provider
  return { clientId, redirectUri: redirect }
}
function authorizeCallback(adapter: KakaoUpstreamAdapter | GoogleUpstreamAdapter, provider: 'kakao' | 'google') {
  const prepared = adapter.prepareAuthorization(); const url = new URL(prepared.authorizationUrl)
  return { url, callback: adapter.validateCallback({ provider, callbackUrl: `${redirect}?code=synthetic-authorize-code&state=${encodeURIComponent(url.searchParams.get('state')!)}` }) }
}
function expectedClaims(provider: 'kakao' | 'google', nonce: string): Record<string, unknown> {
  return { iss: provider === 'kakao' ? KAKAO_OIDC_METADATA.issuer : GOOGLE_OIDC_METADATA.issuers[0], aud: clientId, sub: `synthetic-${provider}-subject`, nonce, iat: NOW - 1, exp: NOW + 300, auth_time: NOW - 2, email: 'synthetic@example.invalid', name: 'not-an-identity-output' }
}

describe('dark upstream provider adapters', () => {
  it('PHASE10O_M_STATELESS_OIDC_RESUME_VERIFY_OK verifies pinned OIDC after process-local state is discarded', async () => {
    const nonce = 'A'.repeat(43)
    const { upstreamNonceDigest } = await import('./durable-upstream-leg')
    const identity = await verifyResumedOidcIdentity({ provider: 'google', authorizationCode: 'opaque/google/code', clientId, redirectUri: redirect, codeVerifier: 'B'.repeat(43), nonceDigest: upstreamNonceDigest(nonce), transport: oidcTransport({ provider: 'google', idToken: jwt(expectedClaims('google', nonce)) }), now: NOW })
    expect(identity).toEqual({ provider: 'google', upstreamSubject: Buffer.from('synthetic-google-subject'), authenticationTime: NOW - 2 })
  })

  it('PHASE10O_M_STATELESS_NAVER_RESUME_VERIFY_OK verifies Naver without a pending adapter object', async () => {
    const identity = await verifyResumedNaverIdentity({ authorizationCode: 'opaque-naver-code', rawState: 'A'.repeat(43), clientId, redirectUri: redirect, transport: { exchangeCode: async request => json({ access_token: 'synthetic-token' }, request.tokenEndpoint), fetchJwks: async () => { throw new Error('unused') }, fetchNaverProfile: async request => json({ resultcode: '00', response: { id: 'synthetic-naver-resumed', email: 'ignored@example.invalid' } }, request.profileEndpoint) } })
    expect(identity).toEqual({ provider: 'naver', upstreamSubject: Buffer.from('synthetic-naver-resumed') })
  })
  it.each([
    ['PHASE10O_L_KAKAO_OIDC_VERIFY_OK', 'kakao'],
    ['PHASE10O_L_GOOGLE_OIDC_VERIFY_OK', 'google'],
  ] as const)('%s verifies only the OIDC minimum identity', async (_marker, provider) => {
    let issued = ''
    const transport = oidcTransport({ provider, get idToken() { return issued } } as never)
    const Adapter = provider === 'kakao' ? KakaoUpstreamAdapter : GoogleUpstreamAdapter
    const adapter = new Adapter(oidcConfig(provider), transport)
    const { url, callback } = authorizeCallback(adapter, provider)
    issued = jwt(expectedClaims(provider, url.searchParams.get('nonce')!))
    const identity = await adapter.exchangeAndVerifyIdentity(callback, NOW)
    expect(identity).toEqual({ provider, upstreamSubject: Buffer.from(`synthetic-${provider}-subject`), authenticationTime: NOW - 2 })
    expect(Object.keys(identity).sort()).toEqual(['authenticationTime', 'provider', 'upstreamSubject'])
    expect(JSON.stringify(identity)).not.toMatch(/email|name|token/i)
    expect(url.searchParams.get('scope')).toBe(provider === 'google' ? 'openid profile' : 'openid')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.has('email')).toBe(false)
    expect(url.searchParams.has('profile')).toBe(false)
  })

  it('PHASE10O_L_UPSTREAM_STATE_ISOLATION_OK, PHASE10O_L_OIDC_NONCE_ISOLATION_OK, and PHASE10O_L_UPSTREAM_PKCE_ISOLATION_OK', () => {
    const kakao = new KakaoUpstreamAdapter(oidcConfig('kakao'), oidcTransport({ provider: 'kakao', idToken: 'unused' }))
    const google = new GoogleUpstreamAdapter(oidcConfig('google'), oidcTransport({ provider: 'google', idToken: 'unused' }))
    const naver = new NaverUpstreamAdapter({ clientId, redirectUri: redirect }, { exchangeCode: async () => { throw new Error('unused') }, fetchJwks: async () => { throw new Error('unused') }, fetchNaverProfile: async () => { throw new Error('unused') } })
    const k = new URL(kakao.prepareAuthorization().authorizationUrl).searchParams
    const g = new URL(google.prepareAuthorization().authorizationUrl).searchParams
    const n = new URL(naver.prepareAuthorization().authorizationUrl).searchParams
    expect(k.get('state')).not.toBe(g.get('state')); expect(k.get('state')).not.toBe(n.get('state')); expect(g.get('state')).not.toBe(n.get('state'))
    expect(k.get('nonce')).not.toBe(g.get('nonce')); expect(k.get('code_challenge')).not.toBe(g.get('code_challenge'))
    expect(n.has('nonce')).toBe(false); expect(n.has('code_challenge')).toBe(false); expect(n.has('code_challenge_method')).toBe(false)
  })

  it('PHASE10O_L_PROVIDER_ENDPOINT_PINNING_OK ignores endpoint substitution and cannot use a forged endpoint JWKS', async () => {
    const evil = { authorizationEndpoint: 'https://evil.invalid/authorize', tokenEndpoint: 'https://evil.invalid/token', jwksUri: 'https://evil.invalid/jwks', profileEndpoint: 'https://evil.invalid/profile' }
    let observed: Record<string, string> = {}
    const transport: UpstreamHttpTransport = {
      exchangeCode: async request => { observed.token = request.tokenEndpoint; return json(request.provider === 'naver' ? { access_token: 'synthetic-naver-token' } : { id_token: 'invalid' }, request.tokenEndpoint) },
      fetchJwks: async request => { observed.jwks = request.jwksUri; return json({ keys: [jwk] }, request.jwksUri) },
      fetchNaverProfile: async request => { observed.profile = request.profileEndpoint; return json({ resultcode: '00', response: { id: 'subject' } }, request.profileEndpoint) },
    }
    const kakao = new KakaoUpstreamAdapter({ clientId, redirectUri: redirect, ...evil } as never, transport)
    const google = new GoogleUpstreamAdapter({ clientId, redirectUri: redirect, ...evil } as never, transport)
    const naver = new NaverUpstreamAdapter({ clientId, redirectUri: redirect, ...evil } as never, transport)
    const kakaoUrl = new URL(kakao.prepareAuthorization().authorizationUrl)
    expect(kakaoUrl.origin).toBe('https://kauth.kakao.com')
    expect(new URL(google.prepareAuthorization().authorizationUrl).origin).toBe('https://accounts.google.com')
    const naverUrl = new URL(naver.prepareAuthorization().authorizationUrl)
    expect(naverUrl.origin).toBe('https://nid.naver.com')
    const callback = kakao.validateCallback({ provider: 'kakao', callbackUrl: `${redirect}?code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7&state=${kakaoUrl.searchParams.get('state')}` })
    await expect(kakao.exchangeAndVerifyIdentity(callback, NOW)).rejects.toThrowError(new SocialBrokerError('UPSTREAM_RESPONSE_MALFORMED'))
    expect(observed.token).toBe(KAKAO_OIDC_METADATA.tokenEndpoint)
    expect(observed.jwks).toBeUndefined()
    const naverCallback = naver.validateCallback({ provider: 'naver', callbackUrl: `${redirect}?code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7&state=${naverUrl.searchParams.get('state')}` })
    await naver.exchangeAndVerifyIdentity(naverCallback, NOW)
    expect(observed.token).toBe(NAVER_OAUTH_METADATA.tokenEndpoint); expect(observed.profile).toBe(NAVER_OAUTH_METADATA.profileEndpoint)
  })

  it('PHASE10O_L_OPAQUE_AUTHORIZATION_CODE_OK preserves Google-shaped and exactly-once decoded opaque codes', async () => {
    let passedCode = ''
    const adapter = new GoogleUpstreamAdapter(oidcConfig('google'), {
      exchangeCode: async request => { passedCode = request.authorizationCode; return json({ id_token: 'invalid' }, request.tokenEndpoint) },
      fetchJwks: async () => { throw new Error('not reached') }, fetchNaverProfile: async () => { throw new Error('not used') },
    })
    const first = new URL(adapter.prepareAuthorization().authorizationUrl)
    const firstCallback = adapter.validateCallback({ provider: 'google', callbackUrl: `${redirect}?code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7&state=${first.searchParams.get('state')}` })
    expect(firstCallback.authorizationCode).toBe('4/P7q7W91a-oMsCeLvIaQm6bTrgtp7')
    await expect(adapter.exchangeAndVerifyIdentity(firstCallback, NOW)).rejects.toThrowError(new SocialBrokerError('UPSTREAM_RESPONSE_MALFORMED'))
    expect(passedCode).toBe('4/P7q7W91a-oMsCeLvIaQm6bTrgtp7')
    const decoded = new GoogleUpstreamAdapter(oidcConfig('google'), { exchangeCode: async request => { passedCode = request.authorizationCode; return json({ id_token: 'invalid' }, request.tokenEndpoint) }, fetchJwks: async () => { throw new Error('not reached') }, fetchNaverProfile: async () => { throw new Error('not used') } })
    const second = new URL(decoded.prepareAuthorization().authorizationUrl)
    const secondCallback = decoded.validateCallback({ provider: 'google', callbackUrl: `${redirect}?code=abc%2Bdef%2Fghi%3D&state=${second.searchParams.get('state')}` })
    expect(secondCallback.authorizationCode).toBe('abc+def/ghi=')
    await expect(decoded.exchangeAndVerifyIdentity(secondCallback, NOW)).rejects.toThrowError(new SocialBrokerError('UPSTREAM_RESPONSE_MALFORMED'))
    expect(passedCode).toBe('abc+def/ghi=')
  })

  it.each(['kakao', 'google'] as const)('rejects the full OIDC verification matrix for %s', async provider => {
    for (const [label, mutate, header, code] of [
    ['wrong issuer', (claims: Record<string, unknown>) => ({ ...claims, iss: 'https://accounts.google.com.evil.example' }), undefined, 'UPSTREAM_RESPONSE_MALFORMED'],
    ['wrong audience', (claims: Record<string, unknown>) => ({ ...claims, aud: 'other-client' }), undefined, 'UPSTREAM_RESPONSE_MALFORMED'],
    ['wrong nonce', (claims: Record<string, unknown>) => ({ ...claims, nonce: 'wrong-nonce' }), undefined, 'NONCE_REJECTED'],
    ['wrong signature', (claims: Record<string, unknown>) => claims, { privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }, 'UPSTREAM_RESPONSE_MALFORMED'],
    ['unknown kid', (claims: Record<string, unknown>) => claims, { kid: 'unknown-kid' }, 'UPSTREAM_RESPONSE_MALFORMED'],
    ['wrong alg', (claims: Record<string, unknown>) => claims, { alg: 'none' }, 'UPSTREAM_RESPONSE_MALFORMED'],
    ['expired', (claims: Record<string, unknown>) => ({ ...claims, exp: NOW - 1 }), undefined, 'UPSTREAM_RESPONSE_EXPIRED'],
    ['missing sub', (claims: Record<string, unknown>) => { const copy = { ...claims }; delete copy.sub; return copy }, undefined, 'UPSTREAM_RESPONSE_MALFORMED'],
    ] as const) {
      let issued = ''; const Adapter = provider === 'kakao' ? KakaoUpstreamAdapter : GoogleUpstreamAdapter
      const adapter = new Adapter(oidcConfig(provider), oidcTransport({ provider, get idToken() { return issued } } as never))
      const { url, callback } = authorizeCallback(adapter, provider)
      issued = jwt(mutate(expectedClaims(provider, url.searchParams.get('nonce')!)), header)
      await expect(adapter.exchangeAndVerifyIdentity(callback, NOW), label).rejects.toThrowError(new SocialBrokerError(code))
    }
  })

  it('PHASE10O_L_PROVIDER_SUBSTITUTION_REJECTED_OK rejects wrong/missing/replayed state and code substitution', () => {
    const adapter = new KakaoUpstreamAdapter(oidcConfig('kakao'), oidcTransport({ provider: 'kakao', idToken: 'unused' }))
    const url = new URL(adapter.prepareAuthorization().authorizationUrl)
    expect(() => adapter.validateCallback({ provider: 'google', callbackUrl: `${redirect}?code=synthetic-authorize-code&state=${url.searchParams.get('state')}` })).toThrowError(new SocialBrokerError('PROVIDER_MISMATCH'))
    expect(() => adapter.validateCallback({ provider: 'kakao', callbackUrl: `${redirect}?code=synthetic-authorize-code&state=wrong` })).toThrowError(new SocialBrokerError('STATE_REJECTED'))
    expect(() => adapter.validateCallback({ provider: 'kakao', callbackUrl: `${redirect}?code=synthetic-authorize-code&state=${url.searchParams.get('state')}` })).toThrowError(new SocialBrokerError('REPLAY_REJECTED'))
    const second = new KakaoUpstreamAdapter(oidcConfig('kakao'), oidcTransport({ provider: 'kakao', idToken: 'unused' })); const secondUrl = new URL(second.prepareAuthorization().authorizationUrl)
    expect(() => second.validateCallback({ provider: 'kakao', callbackUrl: `${redirect}?code=synthetic-authorize-code` })).toThrowError(new SocialBrokerError('UPSTREAM_RESPONSE_MALFORMED'))
    const valid = second.validateCallback({ provider: 'kakao', callbackUrl: `${redirect}?code=synthetic-authorize-code&state=${secondUrl.searchParams.get('state')}` })
    expect(() => (second as unknown as { consumeCallback(input: unknown): unknown }).consumeCallback({ ...valid, authorizationCode: 'other-code' })).toThrowError(new SocialBrokerError('REPLAY_REJECTED'))
  })

  it('PHASE10O_L_NAVER_OAUTH_IDENTITY_OK keeps Naver OAuth2-only and parses only response.id', async () => {
    let tokenIntent: Record<string, unknown> | undefined; let profileAccessToken: string | undefined
    const adapter = new NaverUpstreamAdapter({ clientId, redirectUri: redirect }, {
      exchangeCode: async request => { tokenIntent = request; return json({ access_token: 'synthetic-naver-access-token', refresh_token: 'synthetic-refresh-token' }, request.tokenEndpoint) },
      fetchJwks: async () => { throw new Error('not used') },
      fetchNaverProfile: async request => { profileAccessToken = request.accessToken; return json({ resultcode: '00', message: 'success', response: { id: 'synthetic-naver-subject', email: 'synthetic@example.invalid', nickname: 'ignored' } }, request.profileEndpoint) },
    })
    const prepared = new URL(adapter.prepareAuthorization().authorizationUrl)
    expect(prepared.searchParams.get('response_type')).toBe('code'); expect(prepared.searchParams.has('nonce')).toBe(false); expect(prepared.searchParams.has('code_challenge')).toBe(false)
    const callback = adapter.validateCallback({ provider: 'naver', callbackUrl: `${redirect}?code=synthetic-authorize-code&state=${prepared.searchParams.get('state')}` })
    const identity = await adapter.exchangeAndVerifyIdentity(callback, NOW)
    expect(identity).toEqual({ provider: 'naver', upstreamSubject: Buffer.from('synthetic-naver-subject') })
    expect(tokenIntent).toMatchObject({ provider: 'naver', state: prepared.searchParams.get('state') }); expect(tokenIntent).not.toHaveProperty('clientSecret')
    expect(profileAccessToken).toBe('synthetic-naver-access-token')
  })

  it('rejects Naver missing/malformed response.id and provider substitution', async () => {
    const create = (profile: unknown) => new NaverUpstreamAdapter({ clientId, redirectUri: redirect }, {
      exchangeCode: async request => json({ access_token: 'synthetic-access-token' }, request.tokenEndpoint),
      fetchJwks: async () => { throw new Error('not used') },
      fetchNaverProfile: async request => json(profile, request.profileEndpoint),
    })
    for (const profile of [{ resultcode: '00', response: {} }, { resultcode: '00', response: null }, { resultcode: '01', response: { id: 'subject' } }]) {
      const adapter = create(profile); const url = new URL(adapter.prepareAuthorization().authorizationUrl)
      const callback = adapter.validateCallback({ provider: 'naver', callbackUrl: `${redirect}?code=synthetic-authorize-code&state=${url.searchParams.get('state')}` })
      await expect(adapter.exchangeAndVerifyIdentity(callback, NOW)).rejects.toBeInstanceOf(SocialBrokerError)
    }
    const adapter = create({ resultcode: '00', response: { id: 'subject' } }); const url = new URL(adapter.prepareAuthorization().authorizationUrl)
    expect(() => adapter.validateCallback({ provider: 'kakao', callbackUrl: `${redirect}?code=synthetic-authorize-code&state=${url.searchParams.get('state')}` })).toThrowError(new SocialBrokerError('PROVIDER_MISMATCH'))
  })

  it('rejects malformed/oversize/untrusted upstream transport responses', async () => {
    const malformed = new GoogleUpstreamAdapter(oidcConfig('google'), oidcTransport({ provider: 'google', idToken: 'x', tokenContentType: 'text/plain' }))
    const { callback } = authorizeCallback(malformed, 'google')
    await expect(malformed.exchangeAndVerifyIdentity(callback, NOW)).rejects.toThrowError(new SocialBrokerError('UPSTREAM_ERROR'))
    const oversized = new GoogleUpstreamAdapter(oidcConfig('google'), oidcTransport({ provider: 'google', idToken: 'x', tokenBody: 'x'.repeat(16 * 1024 + 1) }))
    const oversizedCallback = authorizeCallback(oversized, 'google').callback
    await expect(oversized.exchangeAndVerifyIdentity(oversizedCallback, NOW)).rejects.toThrowError(new SocialBrokerError('UPSTREAM_ERROR'))
    const redirected = new GoogleUpstreamAdapter(oidcConfig('google'), oidcTransport({ provider: 'google', idToken: jwt({ ...expectedClaims('google', 'nonce'), nonce: 'nonce' }), jwksUri: 'https://evil.invalid/jwks' }))
    const redirectUrl = new URL(redirected.prepareAuthorization().authorizationUrl); const redirectCallback = redirected.validateCallback({ provider: 'google', callbackUrl: `${redirect}?code=synthetic-authorize-code&state=${redirectUrl.searchParams.get('state')}` })
    await expect(redirected.exchangeAndVerifyIdentity(redirectCallback, NOW)).rejects.toThrowError(new SocialBrokerError('UPSTREAM_ERROR'))
    const tokenRedirected = new GoogleUpstreamAdapter(oidcConfig('google'), oidcTransport({ provider: 'google', idToken: 'unused', tokenUrl: 'https://evil.invalid/token' }))
    const tokenRedirectCallback = authorizeCallback(tokenRedirected, 'google').callback
    await expect(tokenRedirected.exchangeAndVerifyIdentity(tokenRedirectCallback, NOW)).rejects.toThrowError(new SocialBrokerError('UPSTREAM_ERROR'))
  })

  it('PHASE10O_L_UPSTREAM_TOKEN_EPHEMERAL_ONLY_OK and PHASE10O_L_BROKER_SUBJECT_PROVIDER_NAMESPACE_OK', async () => {
    const subject = Buffer.from('same-upstream-subject')
    const key = Buffer.alloc(32, 9)
    expect(deriveBrokerSubject({ provider: 'kakao', upstreamSubject: subject, keyVersion: 'k01', key })).not.toBe(deriveBrokerSubject({ provider: 'google', upstreamSubject: subject, keyVersion: 'k01', key }))
    const output = Object.freeze({ provider: 'google', upstreamSubject: Buffer.from('subject') })
    expect(Object.keys(output).sort()).toEqual(['provider', 'upstreamSubject'])
    expect(JSON.stringify(output)).not.toMatch(/access|refresh|id_token|code|email/i)
  })

  it('PHASE10O_L_PRODUCTION_PROVIDER_NETWORK_ZERO_OK keeps tracked adapters injected, server-only, and route-disconnected', () => {
    const source = readFileSync(new URL('./upstream-adapters.ts', import.meta.url), 'utf8')
    const app = readFileSync(new URL('./http.ts', import.meta.url), 'utf8')
    expect(source).toContain("import 'server-only'")
    expect(source).not.toMatch(/\bfetch\s*\(|axios|https?\.request|undici/i)
    expect(source).not.toMatch(/clientSecret|process\.env|cookie|localStorage|sessionStorage|redis|writeFile/i)
    expect(app).not.toContain('UpstreamAdapter')
  })

  it('PHASE10O_L_PROCESS_LOCAL_PENDING_NOT_PRODUCTION_WIRABLE_OK documents the dark harness boundary', () => {
    const decision = readFileSync(new URL('../../../docs/decisions/2026-08-12-dark-upstream-provider-adapter-boundary.md', import.meta.url), 'utf8')
    expect(decision).toMatch(/process-local protocol harness/i)
    expect(decision).toMatch(/durable\/resumable boundary/i)
    expect(decision).toMatch(/must not.*route singleton or session state/i)
  })
})
