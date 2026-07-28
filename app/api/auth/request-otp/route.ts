import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkAuthRateLimit, getAuthRateLimitKey } from '@/lib/security/authRateLimit'
import { createPublicAuthClient } from '@/lib/user-auth'

const RequestOtpSchema = z.object({ email: z.string().trim().email().max(254) })
const GENERIC_MESSAGE = '입력한 이메일로 인증번호를 보냈습니다.'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? '127.0.0.1'
  const limited = await checkAuthRateLimit(getAuthRateLimitKey('ip', ip))
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

  const parsed = RequestOtpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '이메일 형식을 확인해 주세요.' }, { status: 400 })
  }

  const emailLimited = await checkAuthRateLimit(
    getAuthRateLimitKey('email', parsed.data.email),
    'request'
  )
  if (!emailLimited.allowed) {
    return NextResponse.json(
      { error: emailLimited.status === 429 ? '잠시 후 다시 시도해 주세요.' : '인증을 잠시 사용할 수 없습니다.' },
      { status: emailLimited.status }
    )
  }

  try {
    const client = createPublicAuthClient()
    const { error } = await client.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: true },
    })
    if (error) console.error('Email OTP request failed without exposing account state.')
  } catch {
    console.error('Email OTP request could not reach the auth provider.')
  }

  // Account existence and provider errors are intentionally not disclosed.
  return NextResponse.json({ message: GENERIC_MESSAGE })
}
