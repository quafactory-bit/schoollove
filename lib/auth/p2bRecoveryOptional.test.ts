import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createSign, generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { sealBrowserContinuity, socialContinuityCookie } from './social-broker/browser-continuity-session'
import { buildProviderAuthorizationRequest } from './social-broker/provider-authorization-request'
import { PREVIEW_BROKER_ISSUER, PREVIEW_SUPABASE_CALLBACK } from './social-broker/preview-config'
import { createPreviewRouteAdapter } from './social-broker/preview-route-adapter'
import { activatePreviewSocialAccountFromAttempt, bindPreviewAuthPrincipal, createAccountRecoveryDatabase, createPreviewBrokerPersistence } from './social-broker/preview-persistence'
import { GOOGLE_LOGIN_HINT_COOKIE, oneTapClientId, openLoginHint, sealLoginHint, verifyOneTapCredential } from './social-broker/one-tap-hint'
import { oneTapPost } from './social-broker/one-tap-http'
import { accountRecoveryGet, accountRecoveryPost, type AccountRecoveryHttpDependencies } from './social-account/account-recovery-http'
import type { AccountRecoveryDatabase } from './social-account/account-recovery'
import { InMemoryRecoveryOtpDeliveryTransport } from './social-account/recovery-delivery'
import { recoveryOtpMac } from './social-account/recovery'
import { androidChromeIntent, detectInAppBrowser } from '../inAppBrowser'

const sessionKey = { version: 1 as const, material: Buffer.alloc(32, 41) }
const CLIENT_ID = '123456789012-abcdefghijklmnop.apps.googleusercontent.com'
const rpcClient = (data: unknown = null, error: unknown = null) => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = []
  return { calls, rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => { calls.push({ name, args }); return { data, error } }) }
}

describe('P2b recovery-optional Google sign-up — broker wiring', () => {
  it('finalizes ACCOUNT_DECIDED_RECOVERY_DEFERRED straight to the downstream code (no recovery page)', async () => {
    const rawState = 'R'.repeat(43)
    const browserCookie = sealBrowserContinuity({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 600 }, sessionKey)
    const finalizeReadyAttempt = vi.fn(async () => ({ redirectUri: PREVIEW_SUPABASE_CALLBACK, authorizationCode: 'C'.repeat(43), downstreamState: 'st' }))
    const adapter = createPreviewRouteAdapter({
      now: () => 100, browserSessionKey: sessionKey, downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        continueFromHandle: vi.fn(async () => ({ provider: 'google', authorization: { rawState } })),
        callback: vi.fn(async () => ({ outcome: 'ACCOUNT_DECIDED_RECOVERY_DEFERRED', trustedAttemptId: '44444444-4444-4444-8444-444444444444', authenticationTime: 90, brokerSubject: `slb:v1:k01:google:${'E'.repeat(43)}` })),
        finalizeReadyAttempt,
      } as never, verifier: {} as never, oidc: {} as never,
    })
    const response = await adapter.callback('google', new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/callback/google?code=x&state=${rawState}`, { headers: { cookie: `${socialContinuityCookie.name}=${browserCookie}` } }))
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).not.toBe('/auth/social/recovery')
    expect(new URL(response.headers.get('location')!).searchParams.get('code')).toBe('C'.repeat(43))
    expect(finalizeReadyAttempt).toHaveBeenCalledOnce()
  })

  it('keeps RECOVERY_REQUIRED (legacy delegation) on the recovery page and rejects unknown outcomes', async () => {
    const rawState = 'Q'.repeat(43)
    const browserCookie = sealBrowserContinuity({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43), issuedAt: 1, expiresAt: 600 }, sessionKey)
    const make = (outcome: string) => createPreviewRouteAdapter({
      now: () => 100, browserSessionKey: sessionKey, downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: { continueFromHandle: vi.fn(async () => ({ provider: 'google', authorization: { rawState } })), callback: vi.fn(async () => ({ outcome, trustedAttemptId: '44444444-4444-4444-8444-444444444444', authenticationTime: 90, brokerSubject: `slb:v1:k01:google:${'E'.repeat(43)}` })), finalizeReadyAttempt: vi.fn() } as never,
      verifier: {} as never, oidc: {} as never,
    })
    const request = () => new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/callback/google?code=x&state=${rawState}`, { headers: { cookie: `${socialContinuityCookie.name}=${browserCookie}` } })
    expect((await make('RECOVERY_REQUIRED').callback('google', request())).headers.get('location')).toBe('/auth/social/recovery')
    expect((await make('IDENTITY_DECISION_IN_PROGRESS').callback('google', request())).status).toBe(400)
  })

  it('calls the recovery-optional decision for Google only and the new binder/activator', async () => {
    const google = rpcClient('ACCOUNT_DECIDED_RECOVERY_DEFERRED')
    const input = { attemptId: 'a', legId: 'l', brokerSubject: 's', subjectDigest: new Uint8Array(32), subjectKeyVersion: 1 }
    expect(await createPreviewBrokerPersistence(google).recordVerifiedIdentity({ ...input, provider: 'google' })).toBe('ACCOUNT_DECIDED_RECOVERY_DEFERRED')
    expect(google.calls[0]!.name).toBe('record_verified_google_identity_recovery_optional')
    const kakao = rpcClient('RECOVERY_REQUIRED')
    expect(await createPreviewBrokerPersistence(kakao).recordVerifiedIdentity({ ...input, provider: 'kakao' })).toBe('RECOVERY_REQUIRED')
    expect(kakao.calls[0]!.name).toBe('record_verified_social_identity_from_upstream_leg')
    expect(await createPreviewBrokerPersistence(rpcClient('SOMETHING_NEW')).recordVerifiedIdentity({ ...input, provider: 'google' })).toBe('IDENTITY_REJECTED')
    const bind = rpcClient('AUTH_PRINCIPAL_BOUND')
    await bindPreviewAuthPrincipal(bind, { attemptId: 'a', authUserId: 'u' })
    expect(bind.calls[0]!.name).toBe('bind_social_auth_principal_from_attempt_recovery_optional')
    const activate = rpcClient('SOCIAL_ACCOUNT_ACTIVATED')
    expect(await activatePreviewSocialAccountFromAttempt(activate, 'a')).toBe('SOCIAL_ACCOUNT_ACTIVATED')
    expect(activate.calls[0]!.name).toBe('activate_social_account_from_attempt_recovery_optional')
  })

  it('migration is additive: no function replacement, service-role-only grants, both approved exceptions named', () => {
    const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261120090000_p2b_recovery_optional_social_account.sql'), 'utf8')
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/i)
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|FUNCTION)/i)
    expect(sql).not.toMatch(/\bRENAME\b/i)
    for (const fn of [
      'record_verified_google_identity_recovery_optional(uuid,uuid,text,text,bytea,integer)',
      'bind_social_auth_principal_from_attempt_recovery_optional(uuid,uuid)',
      'activate_social_account_from_attempt_recovery_optional(uuid)',
      'create_and_reserve_account_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)',
      'consume_account_recovery_verification(uuid,uuid,bytea)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC,anon,authenticated;`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`)
    }
    expect(sql).toContain('ADD CONSTRAINT private_accounts_active_principal_recovery_atomic')
    expect(sql).toContain('DROP CONSTRAINT recovery_delivery_reserved_requires_owner')
    expect(sql.match(/DROP CONSTRAINT/g)).toHaveLength(2)
  })
})

describe('P2b Google One Tap — account hint only', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
  const transport = { fetchJwks: vi.fn(async () => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ keys: [jwk] }), url: 'https://www.googleapis.com/oauth2/v3/certs' })) }
  const token = (claims: Record<string, unknown>, kid = 'k1') => {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `${head}.${body}.${createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url')}`
  }
  const good = { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '109876543210987654321', exp: 2000, iat: 900, email: 'person@example.com', name: 'Person' }

  it('returns only the numeric sub for a valid credential and rejects every forged shape', async () => {
    expect(await verifyOneTapCredential({ credential: token(good), clientId: CLIENT_ID, transport, now: 1000 })).toBe('109876543210987654321')
    for (const bad of [
      token({ ...good, aud: 'other.apps.googleusercontent.com' }), token({ ...good, iss: 'https://evil.example' }),
      token({ ...good, exp: 999 }), token({ ...good, sub: 'not-numeric' }), token(good, 'unknown-kid'),
      token(good).replace(/\.[^.]+$/, '.' + Buffer.alloc(256, 1).toString('base64url')), 'a.b', 42,
    ]) await expect(verifyOneTapCredential({ credential: bad, clientId: CLIENT_ID, transport, now: 1000 })).rejects.toThrow('ONE_TAP_HINT_REJECTED')
  })

  it('seals the hint for two minutes and never accepts tamper or expiry', () => {
    const sealed = sealLoginHint({ sub: '123', expiresAt: 220 }, sessionKey)
    expect(sealed).not.toContain('123')
    expect(openLoginHint(sealed, sessionKey, 100)).toBe('123')
    expect(openLoginHint(sealed, sessionKey, 220)).toBeNull()
    expect(openLoginHint(sealed.slice(0, -2) + 'AA', sessionKey, 100)).toBeNull()
    expect(openLoginHint(sealed, { version: 1, material: Buffer.alloc(32, 9) }, 100)).toBeNull()
    expect(openLoginHint(undefined, sessionKey, 100)).toBeNull()
    expect(GOOGLE_LOGIN_HINT_COOKIE.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 120 })
  })

  it('uses login_hint instead of the chooser only for a valid Google hint', () => {
    const base = { provider: 'google' as const, clientId: 'c', redirectUri: 'https://x.invalid/cb', state: 'S'.repeat(43), nonce: 'N'.repeat(43), pkceChallenge: 'P'.repeat(43) }
    const hinted = buildProviderAuthorizationRequest({ ...base, loginHint: '123' })
    expect(hinted.searchParams.get('login_hint')).toBe('123'); expect(hinted.searchParams.has('prompt')).toBe(false)
    expect(hinted.searchParams.get('nonce')).toBe('N'.repeat(43)); expect(hinted.searchParams.get('code_challenge')).toBe('P'.repeat(43))
    expect(buildProviderAuthorizationRequest(base).searchParams.get('prompt')).toBe('select_account')
    expect(() => buildProviderAuthorizationRequest({ ...base, loginHint: 'person@example.com' })).toThrow()
    expect(() => buildProviderAuthorizationRequest({ ...base, provider: 'kakao', loginHint: '123' })).toThrow()
  })

  it('broker authorize reads and clears the sealed hint cookie', async () => {
    const adapter = createPreviewRouteAdapter({
      now: () => 100, browserSessionKey: sessionKey, downstreamCallback: PREVIEW_SUPABASE_CALLBACK,
      orchestrator: {
        input: { upstream: { google: { clientId: 'google-client', redirectUri: 'https://preview.schoollove.invalid/auth/social/callback/google' } } },
        begin: async () => ({ provider: 'google', brokerHandle: 'H'.repeat(43), browserBindingSecret: 'B'.repeat(43) }),
        continueFromHandle: async () => ({ provider: 'google', authorization: { rawState: 'S'.repeat(43), rawNonce: 'N'.repeat(43), pkceChallenge: 'P'.repeat(43) } }),
      } as never, verifier: {} as never, oidc: {} as never,
    })
    const hint = sealLoginHint({ sub: '555', expiresAt: 200 }, sessionKey)
    const response = await adapter.authorize(new Request('https://preview.schoollove.invalid/oauth/authorize', { headers: { cookie: `${GOOGLE_LOGIN_HINT_COOKIE.name}=${hint}` } }))
    const redirect = new URL(response.headers.get('location')!)
    expect(redirect.searchParams.get('login_hint')).toBe('555'); expect(redirect.searchParams.has('prompt')).toBe(false)
    expect(response.headers.get('set-cookie')).toContain(`${GOOGLE_LOGIN_HINT_COOKIE.name}=; Max-Age=0`)
    const expired = await adapter.authorize(new Request('https://preview.schoollove.invalid/oauth/authorize', { headers: { cookie: `${GOOGLE_LOGIN_HINT_COOKIE.name}=${sealLoginHint({ sub: '555', expiresAt: 50 }, sessionKey)}` } }))
    expect(new URL(expired.headers.get('location')!).searchParams.get('prompt')).toBe('select_account')
  })

  it('One Tap endpoint: off without client id, same-origin only, success seals hint and points to the normal start', async () => {
    const deps = { issuer: PREVIEW_BROKER_ISSUER, clientId: CLIENT_ID, browserSessionKey: sessionKey, transport, now: () => 1000 }
    const post = (body: unknown, origin = PREVIEW_BROKER_ISSUER) => new Request(`${PREVIEW_BROKER_ISSUER}/auth/social/one-tap/google`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect((await oneTapPost(post({ credential: token(good) }), { ...deps, clientId: undefined })).status).toBe(404)
    expect((await oneTapPost(post({ credential: token(good) }), { ...deps, clientId: 'not-a-client' })).status).toBe(404)
    expect((await oneTapPost(post({ credential: token(good) }, 'https://evil.example'), deps)).status).toBe(403)
    expect((await oneTapPost(post({ credential: 'x.y.z' }), deps)).status).toBe(400)
    const ok = await oneTapPost(post({ credential: token(good) }), deps)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ next: '/auth/social/start/google' })
    const cookie = ok.headers.get('set-cookie')!
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('Max-Age=120')
    expect(cookie).not.toContain('person@example.com'); expect(cookie).not.toContain('109876543210987654321')
    expect(oneTapClientId(CLIENT_ID)).toBe(CLIENT_ID); expect(oneTapClientId('')).toBeNull()
  })

  it('detects Instagram/Threads/Kakao in-app browsers and builds an Android Chrome intent', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe('instagram')
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) Barcelona 300.0')).toBe('threads')
    expect(detectInAppBrowser('Mozilla/5.0 KAKAOTALK 10.0')).toBe('kakaotalk')
    expect(detectInAppBrowser('Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36')).toBeNull()
    expect(androidChromeIntent('https://www.schoollove.kr/login?ref=ig')).toBe('intent://www.schoollove.kr/login?ref=ig#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.schoollove.kr%2Flogin%3Fref%3Dig;end')
    expect(androidChromeIntent('javascript:alert(1)')).toBeNull()
  })
})

describe('P2b later recovery-email registration (/account)', () => {
  const keys = { recoveryHmacKey: { version: 1, material: Buffer.alloc(32, 6) }, recoveryEncryptionKey: { version: 1, material: Buffer.alloc(32, 7) }, otpMacKey: { version: 1, material: Buffer.alloc(32, 8) } }
  const ACCOUNT = '11111111-1111-4111-8111-111111111111'
  const USER = '22222222-2222-4222-8222-222222222222'
  function setup(state: Record<string, unknown> = { account_id: ACCOUNT, status: 'active', recovery_verified: false }, reserveOutcome = 'RECOVERY_DELIVERY_RESERVED') {
    const transport = new InMemoryRecoveryOtpDeliveryTransport()
    let lastVerification = ''; let lastOtpMac: Uint8Array | null = null
    const database: AccountRecoveryDatabase = {
      reserve: vi.fn(async input => { lastVerification = input.verificationId; lastOtpMac = input.otpMac; expect(input.authUserId).toBe(USER); expect(input.accountId).toBe(ACCOUNT); return { outcome: reserveOutcome, verificationId: input.verificationId, deliveryId: '33333333-3333-4333-8333-333333333333' } }),
      markSent: vi.fn(async () => {}), fail: vi.fn(async () => {}),
      consume: vi.fn(async input => Buffer.from(input.otpMac).equals(Buffer.from(lastOtpMac!)) && input.verificationId === lastVerification ? 'RECOVERY_REGISTERED' : 'OTP_REJECTED'),
    }
    const deps: AccountRecoveryHttpDependencies = {
      owner: async () => ({ userId: USER, client: { rpc: async () => ({ data: [state], error: null }) } }),
      services: async () => ({ keys, database, transport }),
    }
    const post = (body: unknown, origin = 'https://www.schoollove.kr') => new Request('https://www.schoollove.kr/api/account/recovery-email', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { transport, database, deps, post }
  }

  it('GET exposes only a registered/available flag, never the address', async () => {
    const { deps } = setup()
    expect(await (await accountRecoveryGet(new Request('https://www.schoollove.kr/api/account/recovery-email'), deps)).json()).toEqual({ registered: false, available: true })
    const registered = setup({ account_id: ACCOUNT, status: 'active', recovery_verified: true })
    expect(await (await accountRecoveryGet(new Request('https://x.invalid'), registered.deps)).json()).toEqual({ registered: true, available: false })
    expect((await accountRecoveryGet(new Request('https://x.invalid'), { ...deps, owner: async () => null })).status).toBe(401)
  })

  it('send → 8-digit OTP by email → verify registers; wrong OTP and cross-origin are refused', async () => {
    const { transport, database, deps, post } = setup()
    expect((await accountRecoveryPost(post({ action: 'send', email: 'me@example.com' }, 'https://evil.example'), deps)).status).toBe(403)
    expect((await accountRecoveryPost(post({ action: 'send', email: 'not-an-email' }), deps)).status).toBe(400)
    const sent = await accountRecoveryPost(post({ action: 'send', email: ' Me@Example.com ' }), deps)
    expect(sent.status).toBe(200)
    const { challenge } = await sent.json() as { challenge: string }
    expect(transport.deliveries).toHaveLength(1)
    const otp = transport.deliveries[0]!.otp
    expect(otp).toMatch(/^[0-9]{8}$/)
    expect(database.markSent).toHaveBeenCalledOnce()
    expect((await accountRecoveryPost(post({ action: 'verify', challenge, otp: otp === '00000000' ? '00000001' : '00000000' }), deps)).status).toBe(401)
    const verified = await accountRecoveryPost(post({ action: 'verify', challenge, otp }), deps)
    expect(verified.status).toBe(200); expect(await verified.json()).toEqual({ state: 'registered' })
    expect(Buffer.from((database.consume as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].otpMac).equals(Buffer.from(recoveryOtpMac(challenge, otp, keys.otpMacKey)))).toBe(true)
  })

  it('maps limits, already-registered and inactive accounts to coarse answers', async () => {
    const limited = setup(undefined, 'RECOVERY_DELIVERY_LIMITED')
    expect((await accountRecoveryPost(limited.post({ action: 'send', email: 'me@example.com' }), limited.deps)).status).toBe(429)
    expect(limited.transport.deliveries).toHaveLength(0)
    const registered = setup({ account_id: ACCOUNT, status: 'active', recovery_verified: true })
    expect((await accountRecoveryPost(registered.post({ action: 'send', email: 'me@example.com' }), registered.deps)).status).toBe(409)
    const pending = setup({ account_id: ACCOUNT, status: 'provisional', recovery_verified: false })
    expect((await accountRecoveryPost(pending.post({ action: 'send', email: 'me@example.com' }), pending.deps)).status).toBe(409)
    const off = setup()
    expect((await accountRecoveryPost(off.post({ action: 'send', email: 'me@example.com' }), { ...off.deps, services: async () => null })).status).toBe(503)
  })

  it('DB adapter calls only the account-recovery service RPCs', async () => {
    const client = rpcClient([{ outcome: 'RECOVERY_DELIVERY_RESERVED', verification_id: 'v', delivery_id: 'd' }])
    const database = createAccountRecoveryDatabase(client)
    await database.reserve({ authUserId: USER, accountId: ACCOUNT, verificationId: 'v', hmac: new Uint8Array(32), hmacKeyVersion: 1, ciphertext: new Uint8Array(40), nonce: new Uint8Array(12), encryptionKeyVersion: 1, otpMac: new Uint8Array(32), otpKeyVersion: 1 })
    expect(client.calls.map(call => call.name)).toEqual(['create_and_reserve_account_recovery_delivery'])
    expect(JSON.stringify(client.calls)).not.toMatch(/@/)
  })
})
