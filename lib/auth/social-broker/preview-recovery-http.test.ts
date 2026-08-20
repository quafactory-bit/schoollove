import { readFileSync } from 'node:fs'
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

function completionRequest(accessToken = 'submitted-access', refreshToken = 'submitted-refresh'): Request {
  const continuity = sealRecoveryContinuity({
    stage: 'downstream_finalized', provider: 'google', trustedAttemptId: attemptId,
    brokerSubject, authenticationTime: now - 10, verificationId: null,
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
  setSessionError?: unknown
  session?: Readonly<{ access_token: string; refresh_token: string; expires_in?: number }> | null
  getUserError?: unknown
  identityProvider?: string
  identitySubject?: string
  bindError?: unknown
}> = {}) {
  const calls: string[] = []
  const written: Array<Readonly<{ access_token: string; refresh_token: string; expires_in?: number }>> = []
  const session = input.session === undefined ? Object.freeze({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 }) : input.session
  const dependencies: SocialSessionCompletionDependencies = {
    createAuthClient: () => ({ auth: {
      setSession: async tokens => {
        calls.push(`setSession:${tokens.access_token}:${tokens.refresh_token}`)
        return { data: { session, user: null }, error: input.setSessionError ?? null }
      },
      getUser: async accessToken => {
        calls.push(`getUser:${accessToken}`)
        return { data: { user: input.getUserError ? null : { id: authUserId, identities: [{ provider: input.identityProvider ?? 'schoollove-google', identity_data: { sub: input.identitySubject ?? brokerSubject } }] } }, error: input.getUserError ?? null }
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
    expect(recoverySource).toContain("identity.identity_data?.sub === continuity.brokerSubject")
  })

  it('removes Supabase URL-fragment credentials before session completion and never stores them', () => {
    expect(completeSource.indexOf("window.history.replaceState(null, '', '/auth/social/complete')")).toBeLessThan(completeSource.indexOf("fetch('/auth/social/complete/session'"))
    expect(completeSource).not.toMatch(/localStorage|sessionStorage|console\./)
    expect(completeSource).not.toMatch(/attempt_id|account_id|transaction_id|broker_subject/)
  })

  it('validates the submitted token pair, verifies the returned access token, then binds once and writes only rotated tokens', async () => {
    const harness = completionDependencies()
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(200)
    expect(harness.calls).toEqual([
      'setSession:submitted-access:submitted-refresh',
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
    ['valid access with invalid refresh', 'valid-access', 'invalid-refresh'],
    ['invalid access with valid refresh', 'invalid-access', 'valid-refresh'],
  ])('rejects %s before user verification, binding, or cookie persistence', async (_label, accessToken, refreshToken) => {
    const harness = completionDependencies({ setSessionError: new Error('PAIR_REJECTED'), session: null })
    const response = await completeSocialSessionWithServices(completionRequest(accessToken, refreshToken), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).toEqual([`setSession:${accessToken}:${refreshToken}`])
    expect(harness.written).toEqual([])
  })

  it('rejects setSession errors and missing sessions before binding', async () => {
    for (const input of [{ setSessionError: new Error('AUTH_ERROR') }, { session: null }]) {
      const harness = completionDependencies(input)
      const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
      expect(response.status).toBe(400)
      expect(harness.calls).toHaveLength(1)
      expect(harness.written).toEqual([])
    }
  })

  it.each([
    ['broker subject mismatch', { identitySubject: `slb:v1:k01:google:${Buffer.alloc(32, 24).toString('base64url')}` }],
    ['custom provider mismatch', { identityProvider: 'schoollove-kakao' }],
    ['authenticated user missing', { getUserError: new Error('USER_REJECTED') }],
  ])('rejects %s after authoritative verification but before binding', async (_label, input) => {
    const harness = completionDependencies(input)
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).toEqual(['setSession:submitted-access:submitted-refresh', 'getUser:rotated-access'])
    expect(harness.written).toEqual([])
  })

  it('does not persist session cookies when the principal binding rejects', async () => {
    const harness = completionDependencies({ bindError: new Error('BIND_REJECTED') })
    const response = await completeSocialSessionWithServices(completionRequest(), completionServices(), harness.dependencies)
    expect(response.status).toBe(400)
    expect(harness.calls).toEqual([
      'setSession:submitted-access:submitted-refresh',
      'getUser:rotated-access',
      `bind:${attemptId}:${authUserId}`,
    ])
    expect(harness.written).toEqual([])
  })
})
