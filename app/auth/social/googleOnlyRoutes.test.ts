import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { GET as startGoogle } from './start/google/route'
import { GET as kakao } from './callback/kakao/route'
import { GET as naver } from './callback/naver/route'
import { POST as requestOtp } from '@/app/api/auth/request-otp/route'
import { POST as verifyOtp } from '@/app/api/auth/verify-otp/route'

const originalVercelEnv = process.env.VERCEL_ENV

afterEach(() => {
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercelEnv
})

describe('PHASE 10Q Google-only public auth routes', () => {
  it('allows only the exact Preview origin and pins Google authority despite query attempts', async () => {
    process.env.VERCEL_ENV = 'preview'
    const response = await startGoogle(new Request('https://preview.schoollove.kr/auth/social/start/google?provider=kakao&redirect_to=https://evil.invalid'))
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.toString()).toBe('https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/authorize?provider=custom%3Aschoollove-google&redirect_to=https%3A%2F%2Fpreview.schoollove.kr%2Fauth%2Fsocial%2Fcomplete')
  })

  it.each(['production', 'development'])('is dark outside Preview in %s', async (vercelEnv) => {
    process.env.VERCEL_ENV = vercelEnv
    expect((await startGoogle(new Request('https://preview.schoollove.kr/auth/social/start/google'))).status).toBe(404)
  })

  it('is dark when the Preview environment variable is absent or the actual origin is wrong', async () => {
    delete process.env.VERCEL_ENV
    expect((await startGoogle(new Request('https://preview.schoollove.kr/auth/social/start/google'))).status).toBe(404)

    process.env.VERCEL_ENV = 'preview'
    expect((await startGoogle(new Request('https://evil.invalid/auth/social/start/google'))).status).toBe(404)
  })

  it('does not trust spoofed host or forwarded headers to activate the Preview authority', async () => {
    process.env.VERCEL_ENV = 'preview'
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
