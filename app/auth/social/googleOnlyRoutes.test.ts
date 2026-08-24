import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { GET as startGoogle } from './start/google/route'
import { GET as kakao } from './callback/kakao/route'
import { GET as naver } from './callback/naver/route'
import { POST as requestOtp } from '@/app/api/auth/request-otp/route'
import { POST as verifyOtp } from '@/app/api/auth/verify-otp/route'

describe('PHASE 10Q Google-only public auth routes', () => {
  it('pins the Google custom provider and completion URL without request-selected authority', async () => {
    const response = await startGoogle(new Request('https://preview.schoollove.kr/auth/social/start/google?provider=kakao&redirect_to=https://evil.invalid'))
    const location = new URL(response.headers.get('location')!)
    expect(location.toString()).toBe('https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/authorize?provider=custom%3Aschoollove-google&redirect_to=https%3A%2F%2Fpreview.schoollove.kr%2Fauth%2Fsocial%2Fcomplete')
  })

  it('keeps email OTP and unsupported provider callbacks dark', async () => {
    expect((await requestOtp()).status).toBe(404)
    expect((await verifyOtp()).status).toBe(404)
    expect((await kakao()).status).toBe(404)
    expect((await naver()).status).toBe(404)
  })
})
