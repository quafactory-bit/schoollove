import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { openBrowserContinuity, sealBrowserContinuity, socialContinuityCookie } from './browser-continuity-session'
import { buildProviderAuthorizationRequest } from './provider-authorization-request'
import { loadBrokerPreviewConfig } from './preview-config'
import { createServerUpstreamTransport } from './server-transport'
import { GOOGLE_OIDC_METADATA } from './upstream-adapters'
import { createPreviewRouteAdapter } from './preview-route-adapter'

const key = 'A'.repeat(43)
const env = (overrides: Record<string, string | undefined> = {}) => ({
  SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'preview',
  VERCEL_ENV: 'preview',
  SCHOOLLOVE_GOOGLE_CLIENT_ID: 'google-client', SCHOOLLOVE_GOOGLE_CLIENT_SECRET: 'google-secret',
  SCHOOLLOVE_KAKAO_CLIENT_ID: 'kakao-client', SCHOOLLOVE_KAKAO_CLIENT_SECRET: 'kakao-secret',
  SCHOOLLOVE_NAVER_CLIENT_ID: 'naver-client', SCHOOLLOVE_NAVER_CLIENT_SECRET: 'naver-secret',
  SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_CONTINUATION_KEY_V1: key,
  SCHOOLLOVE_SOCIAL_BROKER_BROWSER_SESSION_KEY_V1: key,
  ...overrides,
})

describe('PHASE 10P preview provider foundation', () => {
  it('PHASE10P_CONFIG_FAIL_CLOSED_OK keeps the surface off by default and rejects malformed or Production preview exposure', () => {
    expect(loadBrokerPreviewConfig({})).toEqual({ exposure: 'off' })
    expect(() => loadBrokerPreviewConfig(env({ SCHOOLLOVE_GOOGLE_CLIENT_SECRET: '' }))).toThrow('SOCIAL_BROKER_CONFIG_INVALID')
    expect(() => loadBrokerPreviewConfig(env({ VERCEL_ENV: 'production' }))).toThrow('SOCIAL_BROKER_CONFIG_INVALID')
    expect(loadBrokerPreviewConfig(env()).providers.google.clientId).toBe('google-client')
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
    expect(google.origin).toBe('https://accounts.google.com'); expect(google.searchParams.get('scope')).toBe('openid profile'); expect(google.searchParams.has('email')).toBe(false)
    const kakao = buildProviderAuthorizationRequest({ ...common, provider: 'kakao', nonce: 'N'.repeat(43), pkceChallenge: 'P'.repeat(43) })
    expect(kakao.origin).toBe('https://kauth.kakao.com'); expect(kakao.searchParams.get('scope')).toBe('openid')
    const naver = buildProviderAuthorizationRequest({ ...common, provider: 'naver', nonce: null, pkceChallenge: null })
    expect(naver.origin).toBe('https://nid.naver.com'); expect(naver.searchParams.has('scope')).toBe(false); expect(naver.searchParams.has('nonce')).toBe(false)
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

  it('PHASE10P_ROUTE_COMPOSITION_OK derives provider from the registered flow and seals continuity without URL leakage', async () => {
    const adapter = createPreviewRouteAdapter({
      now: () => 100,
      browserSessionKey: { version: 1, material: Buffer.alloc(32, 3) },
      orchestrator: {
        input: { upstream: { google: { clientId: 'google-client', redirectUri: 'https://preview.schoollove.invalid/auth/social/callback/google' } } },
        begin: async () => ({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43) }),
        continueFromHandle: async () => ({ provider: 'google', authorization: { rawState: 'S'.repeat(43), rawNonce: 'N'.repeat(43), pkceChallenge: 'P'.repeat(43) } }),
      } as never,
      verifier: {} as never,
      oidc: {} as never,
    })
    const response = await adapter.authorize(new Request('https://preview.schoollove.invalid/oauth/authorize?response_type=code'))
    expect(response.status).toBe(302)
    const redirect = new URL(response.headers.get('location')!)
    expect(redirect.origin).toBe('https://accounts.google.com')
    expect(redirect.searchParams.get('scope')).toBe('openid profile'); expect(redirect.searchParams.get('state')).toBe('S'.repeat(43))
    const session = response.headers.get('set-cookie')!
    expect(session).toContain('HttpOnly'); expect(session).toContain('Secure'); expect(session).toContain('SameSite=Lax')
    expect(session).not.toContain('H'.repeat(43)); expect(session).not.toContain('B'.repeat(43)); expect(response.headers.get('location')).not.toContain('B'.repeat(43))
  })
})
