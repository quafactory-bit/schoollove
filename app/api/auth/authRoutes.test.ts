import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const requestSource = readFileSync(join(process.cwd(), 'app/api/auth/request-otp/route.ts'), 'utf8')
const verifySource = readFileSync(join(process.cwd(), 'app/api/auth/verify-otp/route.ts'), 'utf8')

describe('email OTP auth routes', () => {
  it('OTP 요청은 rate limit 뒤에 Supabase 이메일 OTP를 사용하고 계정 존재를 노출하지 않는다', () => {
    expect(requestSource.indexOf('checkAuthRateLimit')).toBeLessThan(requestSource.indexOf('request.json()'))
    expect(requestSource).toContain('client.auth.signInWithOtp')
    expect(requestSource).toContain('shouldCreateUser: true')
    expect(requestSource).toContain('Account existence and provider errors are intentionally not disclosed')
  })

  it('OTP 검증 성공 후에만 httpOnly session cookie helper를 호출한다', () => {
    expect(verifySource.indexOf("checkAuthRateLimit(ip, 'verify')")).toBeLessThan(verifySource.indexOf('request.json()'))
    expect(verifySource).toContain("type: 'email'")
    expect(verifySource).toContain('if (error || !data.session || !data.user)')
    expect(verifySource.lastIndexOf('setUserSessionCookies')).toBeGreaterThan(
      verifySource.indexOf('if (error || !data.session || !data.user)')
    )
  })
})
