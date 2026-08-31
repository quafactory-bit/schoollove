import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { generateKeyPairSync } from 'node:crypto'
import { openBrowserContinuity, sealBrowserContinuity, socialContinuityCookie } from './browser-continuity-session'
import { buildProviderAuthorizationRequest } from './provider-authorization-request'
import {
  PREVIEW_BROKER_ISSUER,
  PREVIEW_SUPABASE_CALLBACK,
  PRODUCTION_BROKER_ISSUER,
  PRODUCTION_SUPABASE_CALLBACK,
  loadBrokerConfig,
} from './preview-config'
import { activeBrokerRouteAdapter, createActiveBrokerRuntime, createActiveBrokerServices } from './preview-runtime'
import { createServerUpstreamTransport } from './server-transport'
import { GOOGLE_OIDC_METADATA } from './upstream-adapters'
import { createPreviewRouteAdapter } from './preview-route-adapter'
import { GOOGLE_CALLBACK_DIAGNOSTIC_REASONS, SocialBrokerError } from './errors'

const key = (value: number) => Buffer.alloc(32, value).toString('base64url')
const signingKey = Buffer.from(JSON.stringify(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' })), 'utf8').toString('base64url')
const env = (overrides: Record<string, string | undefined> = {}) => ({
  SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'preview',
  VERCEL_ENV: 'preview',
  SCHOOLLOVE_GOOGLE_CLIENT_ID: 'google-client', SCHOOLLOVE_GOOGLE_CLIENT_SECRET: 'google-secret',
  SCHOOLLOVE_SUPABASE_GOOGLE_CLIENT_SECRET: 'downstream-google-secret',
  SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_CONTINUATION_KEY_V1: key(1),
  SCHOOLLOVE_SOCIAL_BROKER_BROWSER_SESSION_KEY_V1: key(2),
  SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_PKCE_KEY_V1: key(3),
  SCHOOLLOVE_SOCIAL_BROKER_DOWNSTREAM_NONCE_KEY_V1: key(4),
  SCHOOLLOVE_SOCIAL_BROKER_SUBJECT_KEY_K01: key(5),
  SCHOOLLOVE_SOCIAL_BROKER_OIDC_SIGNING_PRIVATE_JWK_V1: signingKey,
  SCHOOLLOVE_RECOVERY_EMAIL_HMAC_KEY_V1: key(6),
  SCHOOLLOVE_RECOVERY_EMAIL_ENCRYPTION_KEY_V1: key(7),
  SCHOOLLOVE_RECOVERY_OTP_MAC_KEY_V1: key(8),
  SCHOOLLOVE_RECOVERY_RESEND_API_KEY: 'synthetic-resend-key',
  SCHOOLLOVE_RECOVERY_EMAIL_FROM: 'SchoolLove <recovery@schoollove.invalid>',
  ...overrides,
})

describe('PHASE 10P preview provider foundation', () => {
  it('PHASE10P_CONFIG_FAIL_CLOSED_OK keeps the surface off by default and rejects malformed or Production preview exposure', () => {
    expect(loadBrokerConfig({})).toEqual({ exposure: 'off' })
    expect(() => loadBrokerConfig(env({ SCHOOLLOVE_GOOGLE_CLIENT_SECRET: '' }))).toThrow('SOCIAL_BROKER_CONFIG_INVALID')
    expect(() => loadBrokerConfig(env({ VERCEL_ENV: 'production' }))).toThrow('SOCIAL_BROKER_CONFIG_INVALID')
    const config = loadBrokerConfig(env())
    if (config.exposure !== 'preview') throw new Error('expected preview config')
    expect(config.providers.google.clientId).toBe('google-client')
    expect(config.downstreamClients).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientId: 'slb-supabase-google', provider: 'google', redirectUri: PREVIEW_SUPABASE_CALLBACK }),
    ]))
    expect(config.downstreamClients).toHaveLength(1)
    expect(() => loadBrokerConfig(env({ SCHOOLLOVE_SUPABASE_GOOGLE_CLIENT_SECRET: '' }))).toThrow('SOCIAL_BROKER_CONFIG_INVALID')
    expect(() => loadBrokerConfig(env({ SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_PKCE_KEY_V1: key(1) }))).toThrow('SOCIAL_BROKER_CONFIG_INVALID')
  })

  it('binds an immutable Production profile and rejects every cross-environment exposure', async () => {
    const config = loadBrokerConfig(env({ SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'production', VERCEL_ENV: 'production' }))
    if (config.exposure !== 'production') throw new Error('expected production config')
    expect(config).toMatchObject({
      issuer: PRODUCTION_BROKER_ISSUER,
      supabaseCallback: PRODUCTION_SUPABASE_CALLBACK,
      completionRoute: `${PRODUCTION_BROKER_ISSUER}/auth/social/complete`,
      oidcSigningKey: { kid: 'production-rs256-v1' },
    })
    expect(config.downstreamClients).toEqual([
      expect.objectContaining({ clientId: 'slb-supabase-google', provider: 'google', redirectUri: PRODUCTION_SUPABASE_CALLBACK }),
    ])
    const client = { rpc: vi.fn(async () => ({ data: null, error: null })) }
    const services = createActiveBrokerServices(config, client)
    expect(services.orchestrator.input.upstream.google.redirectUri).toBe(`${PRODUCTION_BROKER_ISSUER}/auth/social/callback/google`)
    const runtime = services.adapter
    expect(await runtime.discovery().json()).toMatchObject({ issuer: PRODUCTION_BROKER_ISSUER })
    const jwks = await runtime.jwks().json() as { keys: Array<Record<string, unknown>> }
    expect(jwks.keys[0]).toMatchObject({ kid: 'production-rs256-v1' })
    expect(() => loadBrokerConfig(env({ SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'production', VERCEL_ENV: 'preview' }))).toThrow('SOCIAL_BROKER_CONFIG_INVALID')
    expect(() => loadBrokerConfig(env({ SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'preview', VERCEL_ENV: 'production' }))).toThrow('SOCIAL_BROKER_CONFIG_INVALID')
  })

  it('PHASE10P_DURABLE_SIGNING_CUSTODY_OK keeps RS256 JWKS public and stable across runtime reconstruction', async () => {
    const config = loadBrokerConfig(env())
    if (config.exposure !== 'preview') throw new Error('expected preview config')
    const client = { rpc: vi.fn(async () => ({ data: null, error: null })) }
    const first = createActiveBrokerRuntime(config, client)
    const second = createActiveBrokerRuntime(config, client)
    const firstJwks = await first.jwks().json() as { keys: Array<Record<string, unknown>> }
    const secondJwks = await second.jwks().json() as { keys: Array<Record<string, unknown>> }
    const discovery = await first.discovery().json() as { issuer: string }
    expect(discovery.issuer).toBe(PREVIEW_BROKER_ISSUER)
    expect(firstJwks.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256', kid: 'preview-rs256-v1' })
    expect(firstJwks.keys[0]).not.toHaveProperty('d'); expect(firstJwks.keys[0]).not.toHaveProperty('p')
    expect(firstJwks).toEqual(secondJwks)
  })

  it('PHASE10P_PREVIEW_ORIGIN_AND_CALLBACK_FAIL_CLOSED_OK rejects a foreign origin and all missing, tampered, expired, or wrong-provider continuity callbacks', async () => {
    expect(await activeBrokerRouteAdapter(new Request('https://evil.example/oauth/authorize'))).toBeNull()
    const callback = vi.fn(async () => 'IDENTITY_REJECTED')
    const adapter = createPreviewRouteAdapter({
      now: () => 100,
      browserSessionKey: { version: 1, material: Buffer.alloc(32, 9) },
      downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: { callback, continueFromHandle: vi.fn(async () => ({ provider: 'google', authorization: { rawState: 'T'.repeat(43) } })) } as never,
      verifier: {} as never,
      oidc: {} as never,
    })
    const base = 'https://preview.schoollove.kr/auth/social/callback/kakao?code=opaque&state=' + 'S'.repeat(43)
    expect((await adapter.callback('kakao', new Request(base))).status).toBe(400)
    const validGoogle = sealBrowserContinuity({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 600 }, { version: 1, material: Buffer.alloc(32, 9) })
    expect((await adapter.callback('kakao', new Request(base, { headers: { cookie: `${socialContinuityCookie.name}=${validGoogle}` } }))).status).toBe(400)
    expect((await adapter.callback('google', new Request(base, { headers: { cookie: `${socialContinuityCookie.name}=${validGoogle}x` } }))).status).toBe(400)
    const expired = sealBrowserContinuity({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 100 }, { version: 1, material: Buffer.alloc(32, 9) })
    expect((await adapter.callback('google', new Request(base, { headers: { cookie: `${socialContinuityCookie.name}=${expired}` } }))).status).toBe(400)
    const googleBase = 'https://preview.schoollove.kr/auth/social/callback/google?code=opaque&state=' + 'S'.repeat(43)
    expect((await adapter.callback('google', new Request(googleBase, { headers: { cookie: `${socialContinuityCookie.name}=${validGoogle}` } }))).status).toBe(400)
    expect(callback).not.toHaveBeenCalled()
  })

  it.each(GOOGLE_CALLBACK_DIAGNOSTIC_REASONS)('keeps external callback HTTP 400 and secret-free for %s', async diagnosticReason => {
    const sessionKey = { version: 1 as const, material: Buffer.alloc(32, 19) }
    const rawState = 'S'.repeat(43)
    const sealed = sealBrowserContinuity({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 600 }, sessionKey)
    const adapter = createPreviewRouteAdapter({
      now: () => 100,
      browserSessionKey: sessionKey,
      downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        continueFromHandle: vi.fn(async () => ({ provider: 'google', authorization: { rawState } })),
        callback: vi.fn(async () => { throw new SocialBrokerError(diagnosticReason === 'token_time_failed' ? 'UPSTREAM_RESPONSE_EXPIRED' : 'UPSTREAM_ERROR', { reason: diagnosticReason }) }),
      } as never,
      verifier: {} as never,
      oidc: {} as never,
    })
    const response = await adapter.callback('google', new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/callback/google?code=never-log-authorization-code&state=${rawState}`, { headers: { cookie: `${socialContinuityCookie.name}=${sealed}` } }))
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
    expect([...response.headers.entries()].join('\n')).not.toContain('never-log-authorization-code')
  })

  it('keeps the external callback HTTP 400 for an unclassified verifier failure', async () => {
    const sessionKey = { version: 1 as const, material: Buffer.alloc(32, 20) }
    const rawState = 'U'.repeat(43)
    const sealed = sealBrowserContinuity({ provider: 'google', brokerHandle: 'J'.repeat(43), browserBindingSecret: 'K'.repeat(43), issuedAt: 1, expiresAt: 600 }, sessionKey)
    const adapter = createPreviewRouteAdapter({
      now: () => 100,
      browserSessionKey: sessionKey,
      downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        continueFromHandle: vi.fn(async () => ({ provider: 'google', authorization: { rawState } })),
        callback: vi.fn(async () => { throw new Error('never-log-plain-verifier-error') }),
      } as never,
      verifier: {} as never,
      oidc: {} as never,
    })
    const response = await adapter.callback('google', new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/callback/google?code=never-log-authorization-code&state=${rawState}`, { headers: { cookie: `${socialContinuityCookie.name}=${sealed}` } }))
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
  })

  it('PHASE10P_BROWSER_CONTINUITY_SERVER_ONLY_OK seals a short-lived HttpOnly browser binding and rejects tamper or expiry', () => {
    const material = Buffer.alloc(32, 7)
    const sealed = sealBrowserContinuity({ provider: 'google', brokerHandle: 'A'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 100, expiresAt: 700 }, { version: 1, material })
    expect(openBrowserContinuity(sealed, { version: 1, material }, 699)).toMatchObject({ provider: 'google' })
    expect(() => openBrowserContinuity(`${sealed}x`, { version: 1, material }, 699)).toThrow('SOCIAL_BROWSER_SESSION_REJECTED')
    expect(() => openBrowserContinuity(sealed, { version: 1, material }, 700)).toThrow('SOCIAL_BROWSER_SESSION_REJECTED')
    expect(socialContinuityCookie.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 })
    expect(socialContinuityCookie.name.startsWith('__Host-')).toBe(true)
  })

  it('PHASE10P_PROVIDER_REQUESTS_PINNED_OK builds the exact minimal Google, Kakao, and Naver request contracts', () => {
    const common = { clientId: 'client', redirectUri: 'https://preview.schoollove.invalid/auth/social/callback/google', state: 'S'.repeat(43) }
    const google = buildProviderAuthorizationRequest({ ...common, provider: 'google', nonce: 'N'.repeat(43), pkceChallenge: 'P'.repeat(43) })
    expect(google.origin).toBe('https://accounts.google.com'); expect(google.pathname).toBe('/o/oauth2/v2/auth')
    expect(google.searchParams.get('scope')).toBe('openid profile'); expect(google.searchParams.has('email')).toBe(false)
    expect(google.searchParams.getAll('prompt')).toEqual(['select_account'])
    expect(google.searchParams.get('state')).toBe('S'.repeat(43)); expect(google.searchParams.get('nonce')).toBe('N'.repeat(43))
    expect(google.searchParams.get('code_challenge')).toBe('P'.repeat(43)); expect(google.searchParams.get('code_challenge_method')).toBe('S256')
    const kakao = buildProviderAuthorizationRequest({ ...common, provider: 'kakao', nonce: 'N'.repeat(43), pkceChallenge: 'P'.repeat(43) })
    expect(kakao.origin).toBe('https://kauth.kakao.com'); expect(kakao.searchParams.get('scope')).toBe('openid'); expect(kakao.searchParams.has('prompt')).toBe(false)
    const naver = buildProviderAuthorizationRequest({ ...common, provider: 'naver', nonce: null, pkceChallenge: null })
    expect(naver.origin).toBe('https://nid.naver.com'); expect(naver.searchParams.has('scope')).toBe(false); expect(naver.searchParams.has('nonce')).toBe(false); expect(naver.searchParams.has('prompt')).toBe(false)
  })

  it('PHASE10P_SERVER_TRANSPORT_PINNED_OK uses only configured pinned endpoints with a synthetic intercepted transport', async () => {
    const calls: string[] = []
    const transport = createServerUpstreamTransport({ google: { clientId: 'g', clientSecret: 'gs' }, kakao: { clientId: 'k', clientSecret: 'ks' }, naver: { clientId: 'n', clientSecret: 'ns' } }, (async (url: string | URL) => {
      calls.push(String(url)); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch)
    await transport.exchangeCode({ provider: 'google', tokenEndpoint: GOOGLE_OIDC_METADATA.tokenEndpoint, clientId: 'g', redirectUri: 'https://preview.schoollove.invalid/auth/social/callback/google', authorizationCode: 'synthetic-code', codeVerifier: 'V'.repeat(43) })
    await transport.fetchJwks({ provider: 'google', jwksUri: GOOGLE_OIDC_METADATA.jwksUri })
    await expect(transport.fetchJwks({ provider: 'google', jwksUri: 'https://evil.invalid/jwks' })).rejects.toThrow('UPSTREAM_TRANSPORT_REJECTED')
    expect(calls).toEqual([GOOGLE_OIDC_METADATA.tokenEndpoint, GOOGLE_OIDC_METADATA.jwksUri])
  })

  it('PHASE10P_SERVER_TRANSPORT_DIAGNOSTIC_BOUNDARIES_OK keeps local invariants and received oversized JWKS distinct from fetch failures', async () => {
    let fetchCalls = 0
    const transport = createServerUpstreamTransport({ google: { clientId: 'g', clientSecret: 'synthetic-secret' } }, (async () => {
      fetchCalls += 1
      return new Response('X'.repeat(128 * 1024 + 1), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch)
    let missingCode: unknown
    try { await transport.exchangeCode({ provider: 'google', tokenEndpoint: GOOGLE_OIDC_METADATA.tokenEndpoint, clientId: 'g', redirectUri: 'https://broker.invalid/google/callback', authorizationCode: '', codeVerifier: 'V'.repeat(43) }) } catch (error) { missingCode = error }
    expect(missingCode).toBeInstanceOf(SocialBrokerError)
    expect((missingCode as SocialBrokerError).diagnosticReason).toBeUndefined()
    let missingVerifier: unknown
    try { await transport.exchangeCode({ provider: 'google', tokenEndpoint: GOOGLE_OIDC_METADATA.tokenEndpoint, clientId: 'g', redirectUri: 'https://broker.invalid/google/callback', authorizationCode: 'synthetic-code', codeVerifier: '' }) } catch (error) { missingVerifier = error }
    expect(missingVerifier).toMatchObject({ diagnosticReason: 'pkce_resume_failed' })
    let oversizedJwks: unknown
    try { await transport.fetchJwks({ provider: 'google', jwksUri: GOOGLE_OIDC_METADATA.jwksUri }) } catch (error) { oversizedJwks = error }
    expect(oversizedJwks).toMatchObject({ diagnosticReason: 'jwks_key_rejected' })
    expect(fetchCalls).toBe(1)
  })

  it('PHASE10P_ROUTE_COMPOSITION_OK derives provider from the registered flow and seals continuity without URL leakage', async () => {
    const adapter = createPreviewRouteAdapter({
      now: () => 100,
      browserSessionKey: { version: 1, material: Buffer.alloc(32, 3) },
      downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        input: { upstream: { google: { clientId: 'google-client', redirectUri: 'https://preview.schoollove.invalid/auth/social/callback/google' } } },
        begin: async () => ({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43) }),
        continueFromHandle: async () => ({ provider: 'google', authorization: { rawState: 'S'.repeat(43), rawNonce: 'N'.repeat(43), pkceChallenge: 'P'.repeat(43) } }),
      } as never,
      verifier: {} as never,
      oidc: {} as never,
    })
    const response = await adapter.authorize(new Request('https://preview.schoollove.invalid/oauth/authorize?response_type=code&prompt=none&prompt=consent', {
      headers: { prompt: 'none', 'x-oauth-prompt': 'consent', 'x-login-hint': 'forged-account' },
    }))
    expect(response.status).toBe(302)
    const redirect = new URL(response.headers.get('location')!)
    expect(redirect.origin).toBe('https://accounts.google.com')
    expect(redirect.searchParams.get('scope')).toBe('openid profile'); expect(redirect.searchParams.get('state')).toBe('S'.repeat(43))
    expect(redirect.searchParams.getAll('prompt')).toEqual(['select_account']); expect(redirect.searchParams.has('login_hint')).toBe(false)
    const session = response.headers.get('set-cookie')!
    expect(session).toContain('HttpOnly'); expect(session).toContain('Secure'); expect(session).toContain('SameSite=Lax')
    expect(session).not.toContain('H'.repeat(43)); expect(session).not.toContain('B'.repeat(43)); expect(response.headers.get('location')).not.toContain('B'.repeat(43))
  })

  it('PHASE10P_CALLBACK_EXISTING_PRIMARY_FINALIZES_EXACTLY and preserves downstream state', async () => {
    const sessionKey = { version: 1 as const, material: Buffer.alloc(32, 31) }
    const rawState = 'S'.repeat(43)
    const browserCookie = sealBrowserContinuity({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 600 }, sessionKey)
    const finalizeReadyAttempt = vi.fn(async () => ({ redirectUri: PREVIEW_SUPABASE_CALLBACK, authorizationCode: 'C'.repeat(43), downstreamState: 'exact + state/&=한글' }))
    const adapter = createPreviewRouteAdapter({
      now: () => 100, browserSessionKey: sessionKey, downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        continueFromHandle: vi.fn(async () => ({ provider: 'google', authorization: { rawState } })),
        callback: vi.fn(async () => ({ outcome: 'EXISTING_PRIMARY', trustedAttemptId: '11111111-1111-4111-8111-111111111111', authenticationTime: 90, brokerSubject: `slb:v1:k01:google:${'A'.repeat(43)}` })),
        finalizeReadyAttempt,
      } as never, verifier: {} as never, oidc: {} as never,
    })
    const response = await adapter.callback('google', new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/callback/google?code=opaque&state=${rawState}`, { headers: { cookie: `${socialContinuityCookie.name}=${browserCookie}` } }))
    expect(response.status).toBe(302)
    const destination = new URL(response.headers.get('location')!)
    expect(destination.origin + destination.pathname).toBe(PREVIEW_SUPABASE_CALLBACK)
    expect(destination.searchParams.get('code')).toBe('C'.repeat(43))
    expect(destination.searchParams.get('state')).toBe('exact + state/&=한글')
    expect(finalizeReadyAttempt).toHaveBeenCalledWith({ trustedAttemptId: '11111111-1111-4111-8111-111111111111', authenticationTime: 90 })
    expect(response.headers.get('set-cookie')).not.toContain('11111111-1111-4111-8111-111111111111')
    expect(response.headers.get('set-cookie')).not.toContain('slb:v1:')
  })

  it('PHASE10P_CALLBACK_PROVISIONAL_RESUME_FINALIZES_WITHOUT_RECOVERY and seals downstream continuity', async () => {
    const sessionKey = { version: 1 as const, material: Buffer.alloc(32, 35) }
    const rawState = 'R'.repeat(43)
    const trustedAttemptId = '33333333-3333-4333-8333-333333333333'
    const browserCookie = sealBrowserContinuity({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 600 }, sessionKey)
    const finalizeReadyAttempt = vi.fn(async () => ({ redirectUri: PREVIEW_SUPABASE_CALLBACK, authorizationCode: 'D'.repeat(43), downstreamState: 'resume-state' }))
    const adapter = createPreviewRouteAdapter({
      now: () => 100, browserSessionKey: sessionKey, downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        continueFromHandle: vi.fn(async () => ({ provider: 'google', authorization: { rawState } })),
        callback: vi.fn(async () => ({ outcome: 'PROVISIONAL_RESUME_READY', trustedAttemptId, authenticationTime: 90, brokerSubject: `slb:v1:k01:google:${'C'.repeat(43)}` })),
        finalizeReadyAttempt,
      } as never, verifier: {} as never, oidc: {} as never,
    })
    const response = await adapter.callback('google', new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/callback/google?code=opaque&state=${rawState}`, { headers: { cookie: `${socialContinuityCookie.name}=${browserCookie}` } }))
    expect(response.status).toBe(302)
    const destination = new URL(response.headers.get('location')!)
    expect(destination.origin + destination.pathname).toBe(PREVIEW_SUPABASE_CALLBACK)
    expect(destination.searchParams.get('code')).toBe('D'.repeat(43))
    expect(destination.searchParams.get('state')).toBe('resume-state')
    expect(finalizeReadyAttempt).toHaveBeenCalledOnce()
    const cookies = response.headers.get('set-cookie')!
    expect(cookies).not.toContain(trustedAttemptId)
    expect(cookies).not.toContain('slb:v1:')
    expect(response.headers.get('location')).not.toBe('/auth/social/recovery')
  })

  it('PHASE10P_CALLBACK_BOUND_PROVISIONAL_REAUTH_FINALIZES_WITHOUT_RECOVERY', async () => {
    const sessionKey = { version: 1 as const, material: Buffer.alloc(32, 36) }
    const rawState = 'U'.repeat(43)
    const trustedAttemptId = '44444444-4444-4444-8444-444444444444'
    const browserCookie = sealBrowserContinuity({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 600 }, sessionKey)
    const finalizeReadyAttempt = vi.fn(async () => ({ redirectUri: PREVIEW_SUPABASE_CALLBACK, authorizationCode: 'E'.repeat(43), downstreamState: 'bound-reauth' }))
    const adapter = createPreviewRouteAdapter({
      now: () => 100, browserSessionKey: sessionKey, downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        continueFromHandle: vi.fn(async () => ({ provider: 'google', authorization: { rawState } })),
        callback: vi.fn(async () => ({ outcome: 'BOUND_PROVISIONAL_REAUTH_READY', trustedAttemptId, authenticationTime: 90, brokerSubject: `slb:v1:k01:google:${'D'.repeat(43)}` })),
        finalizeReadyAttempt,
      } as never, verifier: {} as never, oidc: {} as never,
    })
    const response = await adapter.callback('google', new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/callback/google?code=opaque&state=${rawState}`, { headers: { cookie: `${socialContinuityCookie.name}=${browserCookie}` } }))
    expect(response.status).toBe(302)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/v1/callback')
    expect(response.headers.get('location')).not.toBe('/auth/social/recovery')
    expect(finalizeReadyAttempt).toHaveBeenCalledOnce()
  })

  it('PHASE10P_CALLBACK_RECOVERY_REQUIRED issues no code and exposes only opaque recovery continuity', async () => {
    const sessionKey = { version: 1 as const, material: Buffer.alloc(32, 32) }
    const rawState = 'T'.repeat(43)
    const browserCookie = sealBrowserContinuity({ provider: 'naver', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 600 }, sessionKey)
    const finalizeReadyAttempt = vi.fn()
    const adapter = createPreviewRouteAdapter({
      now: () => 100, browserSessionKey: sessionKey, downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        continueFromHandle: vi.fn(async () => ({ provider: 'naver', authorization: { rawState } })),
        callback: vi.fn(async () => ({ outcome: 'RECOVERY_REQUIRED', trustedAttemptId: '22222222-2222-4222-8222-222222222222', authenticationTime: 90, brokerSubject: `slb:v1:k01:naver:${'B'.repeat(43)}` })),
        finalizeReadyAttempt,
      } as never, verifier: {} as never, oidc: {} as never,
    })
    const response = await adapter.callback('naver', new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/callback/naver?code=opaque&state=${rawState}`, { headers: { cookie: `${socialContinuityCookie.name}=${browserCookie}` } }))
    expect(response.status).toBe(302); expect(response.headers.get('location')).toBe('/auth/social/recovery')
    expect(finalizeReadyAttempt).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie')).not.toContain('22222222-2222-4222-8222-222222222222')
    expect(response.headers.get('set-cookie')).not.toContain('slb:v1:')
  })
})
