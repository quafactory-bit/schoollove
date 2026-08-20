import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import {
  activePreviewRecoveryServices,
  completeSocialSessionWithServices,
  recoveryGet,
  type SocialSessionCompletionDependencies,
} from './preview-recovery-http'
import { recoveryContinuityCookie, sealRecoveryContinuity } from './recovery-continuity-session'
import type { ActivePreviewServices } from './preview-runtime'

const recoverySource = readFileSync(new URL('./preview-recovery-http.ts', import.meta.url), 'utf8')
const completeSource = readFileSync(new URL('../../../app/auth/social/complete/SocialCompleteClient.tsx', import.meta.url), 'utf8')
const now = 1_800_000_000
const browserSessionKey = Object.freeze({ version: 1 as const, material: new Uint8Array(32).fill(17) })
const brokerSubject = `slb:v1:k01:google:${Buffer.alloc(32, 23).toString('base64url')}`
const attemptId = '11111111-1111-4111-8111-111111111111'
const authUserId = '22222222-2222-4222-8222-222222222222'
const otherAuthUserId = '33333333-3333-4333-8333-333333333333'

function subject(provider: 'google' | 'kakao' | 'naver'): string {
  return `slb:v1:k01:${provider}:${Buffer.alloc(32, provider === 'google' ? 23 : provider === 'kakao' ? 24 : 25).toString('base64url')}`
}

function completionRequest(
  accessToken = 'submitted-access',
  refreshToken = 'submitted-refresh',
  provider: 'google' | 'kakao' | 'naver' = 'google',
): Request {
  const expectedSubject = subject(provider)
  const continuity = sealRecoveryContinuity({
    stage: 'downstream_finalized', provider, trustedAttemptId: attemptId,
    brokerSubject: expectedSubject, authenticationTime: now - 10, verificationId: null,
    issuedAt: now - 5, expiresAt: now + 300,
  }, browserSessionKey)
  return new Request('https://preview.schoollove.kr/auth/social/complete/session', {
    method: 'POST', headers: { origin: 'https://preview.schoollove.kr', 'content-type': 'application/json', cookie: `${recoveryContinuityCookie.name}=${continuity}` },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
  })
}

function completionServices(): ActivePreviewServices {
  return { config: { browserSessionKey }, client: {}, now: () => now } as unknown as ActivePreviewServices
}

function completionDependencies(input: Readonly<{
  accessUserId?: string
  refreshUserId?: string
  submittedAccessError?: unknown
  refreshError?: unknown
  refreshedAccessError?: unknown
  session?: Readonly<{ access_token: string; refresh_token: string; expires_in?: number }> | null
  identityProvider?: string
  identityProviderId?: string
  identitySubject?: string
  bindError?: unknown
}> = {}) {
  const calls: string[] = []
  const written: Array<Readonly<{ access_token: string; refresh_token: string; expires_in?: number }>> = []
  const session = input.session === undefined ? Object.freeze({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 }) : input.session
  const dependencies: SocialSessionCompletionDependencies = {
    createAuthClient: () => ({ auth: {
      getUser: async accessToken => {
        calls.push(`getUser:${accessToken}`)
        if (accessToken !== 'rotated-access') {
          return { data: { user: input.submittedAccessError ? null : { id: input.accessUserId ?? authUserId, identities: [] } }, error: input.submittedAccessError ?? null }
        }
        const identitySubject = input.identitySubject ?? brokerSubject
        return { data: { user: input.refreshedAccessError ? null : { id: input.refreshUserId ?? authUserId, identities: [{ id: input.identityProviderId ?? brokerSubject, provider: input.identityProvider ?? 'custom:schoollove-google', identity_data: { sub: identitySubject } }] } }, error: input.refreshedAccessError ?? null }
      },
      refreshSession: async tokens => {
        calls.push(`refreshSession:${tokens.refresh_token}`)
        return { data: { session, user: null }, error: input.refreshError ?? null }
      },
    } }),
    bindPrincipal: async (_client, binding) => {
      calls.push(`bind:${binding.attemptId}:${binding.authUserId}`)
      if (input.bindError) throw input.bindError
    },
    createSuccessResponse: () => Response.json({ authenticated: true, redirect: '/account' }, { headers: { 'cache-control': 'no-store' } }),
    setSessionCookies: (response, tokens) => {
      calls.push('cookies')
      written.push(Object.freeze({ ...tokens }))
      response.headers.append('set-cookie', `schoollove-access=${tokens.access_token}; HttpOnly`)
      response.headers.append('set-cookie', `schoollove-refresh=${tokens.refresh_token}; HttpOnly`)
    },
  }
  return { calls, written, dependencies }
}

describe('Preview first-login HTTP boundary', () => {
  it('keeps recovery unavailable off Preview and on foreign origins', async () => {
    vi.stubEnv('SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE', 'off')
    await expect(activePreviewRecoveryServices(new Request('https://evil.example/auth/social/recovery'))).resolves.toBeNull()
    await expect(recoveryGet(new Request('https://preview.schoollove.kr/auth/social/recovery'))).resolves.toMatchObject({ status: 404 })
    vi.unstubAllEnvs()
  })

  it('accepts no browser durable identity fields and has no secret logging path', () => {
    expect(recoverySource).not.toMatch(/form\.get\(['"](?:attempt_id|account_id|transaction_id|provider|broker_subject)['"]\)/)
    expect(recoverySource).not.toMatch(/console\.|localStorage|sessionStorage/)
    expect(recoverySource).toContain("request.headers.get('origin') !== PREVIEW_BROKER_ISSUER")
    expect(recoverySource).toContain("identity.provider === expectedProvider")
    expect(recoverySource).toContain("identity.id === continuity.brokerSubject")
    expect(recoverySource).toContain("identity.identity_data?.sub === continuity.brokerSubject")
  })

  it('removes Supabase URL-fragment credentials before session completion and never stores them', () => {
    expect(completeSource.indexOf("window.history.replaceState(null, '', '/auth/social/complete')")).toBeLessThan(completeSource.indexOf("fetch('/auth/social/complete/session'"))
    expect(completeSource).not.toMatch(/localStorage|sessionStorage|console\./)
    expect(completeSource).not.toMatch(/attempt_id|account_id|transaction_id|broker_subject/)
  })

  it('forces a refresh exchange, verifies both users, then binds once and writes only rotated tokens', async () => {
    const harness = completionDependencies()
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(200)
    expect(harness.calls).toEqual([
      'getUser:submitted-access',
      'refreshSession:submitted-refresh',
      'getUser:rotated-access',
      `bind:${attemptId}:${authUserId}`,
      'cookies',
    ])
    expect(harness.written).toEqual([{ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 }])
    const serializedResponse = `${await response.clone().text()}\n${[...response.headers].map(([name, value]) => `${name}:${value}`).join('\n')}`
    expect(serializedResponse).not.toContain('submitted-access')
    expect(serializedResponse).not.toContain('submitted-refresh')
    expect(serializedResponse).not.toContain(brokerSubject)
  })

  it.each([
    ['A access plus B refresh', authUserId, otherAuthUserId],
    ['B access plus A refresh', otherAuthUserId, authUserId],
  ])('rejects individually valid but incoherent %s before binding or cookies', async (_label, accessUserId, refreshUserId) => {
    const harness = completionDependencies({ accessUserId, refreshUserId })
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).toEqual(['getUser:submitted-access', 'refreshSession:submitted-refresh', 'getUser:rotated-access'])
    expect(harness.written).toEqual([])
  })

  it('rejects a valid access token with an invalid refresh token', async () => {
    const harness = completionDependencies({ refreshError: new Error('REFRESH_REJECTED'), session: null })
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).toEqual(['getUser:submitted-access', 'refreshSession:submitted-refresh'])
    expect(harness.written).toEqual([])
  })

  it('rejects an invalid access token without accepting an independently valid refresh token', async () => {
    const harness = completionDependencies({ submittedAccessError: new Error('ACCESS_REJECTED') })
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).toEqual(['getUser:submitted-access'])
    expect(harness.written).toEqual([])
  })

  it('rejects refresh errors and missing refresh-derived sessions before binding', async () => {
    for (const input of [{ refreshError: new Error('AUTH_ERROR') }, { session: null }]) {
      const harness = completionDependencies(input)
      const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
      expect(response.status).toBe(400)
      expect(harness.calls).toHaveLength(2)
      expect(harness.written).toEqual([])
    }
  })

  it.each([
    ['broker subject mismatch', { identitySubject: `slb:v1:k01:google:${Buffer.alloc(32, 24).toString('base64url')}` }],
    ['custom provider mismatch', { identityProvider: 'custom:schoollove-kakao' }],
    ['provider ID mismatch', { identityProviderId: `slb:v1:k01:google:${Buffer.alloc(32, 26).toString('base64url')}` }],
    ['authenticated user missing', { refreshedAccessError: new Error('USER_REJECTED') }],
  ])('rejects %s after authoritative verification but before binding', async (_label, input) => {
    const harness = completionDependencies(input)
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).toEqual(['getUser:submitted-access', 'refreshSession:submitted-refresh', 'getUser:rotated-access'])
    expect(harness.written).toEqual([])
  })

  it('rejects a Kakao attempt presented with an exact Google custom identity', async () => {
    const kakaoSubject = subject('kakao')
    const harness = completionDependencies({ identityProvider: 'custom:schoollove-google', identityProviderId: kakaoSubject, identitySubject: kakaoSubject })
    const response = await completeSocialSessionWithServices(completionRequest('submitted-access', 'submitted-refresh', 'kakao'), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).not.toContain('cookies')
    expect(harness.calls.some(call => call.startsWith('bind:'))).toBe(false)
  })

  it('does not persist session cookies when the principal binding rejects', async () => {
    const harness = completionDependencies({ bindError: new Error('BIND_REJECTED') })
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).toEqual([
      'getUser:submitted-access',
      'refreshSession:submitted-refresh',
      'getUser:rotated-access',
      `bind:${attemptId}:${authUserId}`,
    ])
    expect(harness.written).toEqual([])
  })

  it('uses auth-js 2.106.1 refreshSession to call the refresh endpoint even when the submitted access token is valid', async () => {
    const requests: Array<Readonly<{ method: string; path: string; authorization: string | null }>> = []
    const identity = { id: brokerSubject, identity_id: '44444444-4444-4444-8444-444444444444', user_id: authUserId, provider: 'custom:schoollove-google', identity_data: { sub: brokerSubject } }
    const user = { id: authUserId, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString(), identities: [identity] }
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      requests.push({ method: init?.method ?? 'GET', path: `${url.pathname}${url.search}`, authorization: headers.get('authorization') })
      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'refresh_token') {
        return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user })
      }
      if (url.pathname.endsWith('/user')) return Response.json({ user })
      return Response.json({ error: 'unexpected_request' }, { status: 500 })
    }
    const client = createClient('https://adapter-contract.invalid', 'synthetic-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetcher },
    })
    const harness = completionDependencies()
    const dependencies: SocialSessionCompletionDependencies = { ...harness.dependencies, createAuthClient: () => client }
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), dependencies)
    expect(response.status).toBe(200)
    expect(requests).toEqual([
      { method: 'GET', path: '/auth/v1/user', authorization: 'Bearer submitted-access' },
      { method: 'POST', path: '/auth/v1/token?grant_type=refresh_token', authorization: 'Bearer synthetic-anon-key' },
      { method: 'GET', path: '/auth/v1/user', authorization: 'Bearer rotated-access' },
    ])
    expect(harness.written).toEqual([{ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 }])
  })
})
