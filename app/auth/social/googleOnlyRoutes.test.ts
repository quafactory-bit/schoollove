import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { GET as startGoogle } from './start/google/route'
import { GET as callbackGoogle } from './callback/google/route'
import { GET as authorizeOidc } from '@/app/oauth/authorize/route'
import { POST as tokenOidc } from '@/app/oauth/token/route'
import { GET as kakao } from './callback/kakao/route'
import { GET as naver } from './callback/naver/route'
import { POST as requestOtp } from '@/app/api/auth/request-otp/route'
import { POST as verifyOtp } from '@/app/api/auth/verify-otp/route'

const key = (value: number) => Buffer.alloc(32, value).toString('base64url')
const signingKey = Buffer.from(JSON.stringify(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' })), 'utf8').toString('base64url')
const syntheticEnv = Object.freeze({
  SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'preview',
  VERCEL_ENV: 'preview',
  SCHOOLLOVE_GOOGLE_CLIENT_ID: 'synthetic-google-client',
  SCHOOLLOVE_GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
  SCHOOLLOVE_SUPABASE_GOOGLE_CLIENT_SECRET: 'synthetic-downstream-secret',
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
})

function configure(overrides: Partial<Record<keyof typeof syntheticEnv, string>> = {}) {
  for (const [name, value] of Object.entries({ ...syntheticEnv, ...overrides })) vi.stubEnv(name, value)
}

beforeEach(() => configure())
afterEach(() => vi.unstubAllEnvs())

describe('PHASE 10Q Google-only public auth routes', () => {
  it('allows only the exact Preview origin and pins Google authority despite query attempts', async () => {
    const response = await startGoogle(new Request('https://preview.schoollove.kr/auth/social/start/google?provider=kakao&redirect_to=https://evil.invalid'))
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.toString()).toBe('https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/authorize?provider=custom%3Aschoollove-google&redirect_to=https%3A%2F%2Fpreview.schoollove.kr%2Fauth%2Fsocial%2Fcomplete')
  })

  it('uses the exact Production Supabase authority and canonical completion route only in the Production profile', async () => {
    configure({ SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'production', VERCEL_ENV: 'production' })
    const response = await startGoogle(new Request('https://www.schoollove.kr/auth/social/start/google'))
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://ucnybhzpbatzcipwqtox.supabase.co/auth/v1/authorize?provider=custom%3Aschoollove-google&redirect_to=https%3A%2F%2Fwww.schoollove.kr%2Fauth%2Fsocial%2Fcomplete')
    expect((await startGoogle(new Request('https://preview.schoollove.kr/auth/social/start/google'))).status).toBe(404)
  })

  it('keeps Production Google start and callback dark during issuer bootstrap', async () => {
    configure({ SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'production-bootstrap', VERCEL_ENV: 'production' })
    expect((await startGoogle(new Request('https://www.schoollove.kr/auth/social/start/google'))).status).toBe(404)
    expect((await callbackGoogle(new Request('https://www.schoollove.kr/auth/social/callback/google?code=opaque&state=opaque'))).status).toBe(404)
    expect((await authorizeOidc(new Request('https://www.schoollove.kr/oauth/authorize'))).status).toBe(404)
    expect((await tokenOidc(new Request('https://www.schoollove.kr/oauth/token', { method: 'POST' }))).status).toBe(404)
  })

  it.each(['production', 'development'])('is dark for a Preview exposure in the %s Vercel environment', async (vercelEnv) => {
    configure({ VERCEL_ENV: vercelEnv })
    expect((await startGoogle(new Request('https://preview.schoollove.kr/auth/social/start/google'))).status).toBe(404)
  })

  it('is dark when exposure is absent or the actual origin is wrong', async () => {
    vi.stubEnv('SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE', '')
    expect((await startGoogle(new Request('https://preview.schoollove.kr/auth/social/start/google'))).status).toBe(404)

    configure()
    expect((await startGoogle(new Request('https://evil.invalid/auth/social/start/google'))).status).toBe(404)
  })

  it('does not trust spoofed host or forwarded headers to activate the Preview authority', async () => {
    const response = await startGoogle(new Request('https://evil.invalid/auth/social/start/google', {
      headers: {
        host: 'preview.schoollove.kr',
        'x-forwarded-host': 'preview.schoollove.kr',
        'x-forwarded-proto': 'https',
      },
    }))
    expect(response.status).toBe(404)
  })

  it('keeps email OTP and unsupported provider callbacks dark', async () => {
    expect((await requestOtp()).status).toBe(404)
    expect((await verifyOtp()).status).toBe(404)
    expect((await kakao()).status).toBe(404)
    expect((await naver()).status).toBe(404)
  })
})
