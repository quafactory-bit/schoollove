import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createPublicAuthClient, setUserSessionCookies } from '@/lib/user-auth'
import { checkAuthRateLimit, getAuthRateLimitKey } from '@/lib/security/authRateLimit'

const VerifyOtpSchema = z.object({
  email: z.string().trim().email().max(254),
  token: z.string().trim().regex(/^\d{6}$/),
})

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? '127.0.0.1'
  const limited = await checkAuthRateLimit(getAuthRateLimitKey('ip', ip), 'verify')
  if (!limited.allowed) {
    return NextResponse.json(
      { error: limited.status === 429 ? '잠시 후 다시 시도해 주세요.' : '인증을 잠시 사용할 수 없습니다.' },
      {
        status: limited.status,
        headers: limited.retryAfter ? { 'Retry-After': String(limited.retryAfter) } : undefined,
      }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const parsed = VerifyOtpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '이메일과 6자리 인증번호를 확인해 주세요.' }, { status: 400 })
  }

  const emailLimited = await checkAuthRateLimit(
    getAuthRateLimitKey('email', parsed.data.email),
    'verify'
  )
  if (!emailLimited.allowed) {
    return NextResponse.json(
      { error: emailLimited.status === 429 ? '잠시 후 다시 시도해 주세요.' : '인증을 잠시 사용할 수 없습니다.' },
      { status: emailLimited.status }
    )
  }

  try {
    const client = createPublicAuthClient()
    const { data, error } = await client.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: 'email',
    })
    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: '인증번호가 올바르지 않거나 만료되었습니다.' }, { status: 401 })
    }

    const response = NextResponse.json({ authenticated: true })
    setUserSessionCookies(response, data.session)
    await client.rpc('record_own_otp_verified_milestone')
    return response
  } catch {
    return NextResponse.json({ error: '인증을 완료할 수 없습니다.' }, { status: 503 })
  }
}
