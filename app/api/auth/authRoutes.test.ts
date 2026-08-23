import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const requestSource = readFileSync(join(process.cwd(), 'app/api/auth/request-otp/route.ts'), 'utf8')
const verifySource = readFileSync(join(process.cwd(), 'app/api/auth/verify-otp/route.ts'), 'utf8')
const logoutSource = readFileSync(join(process.cwd(), 'app/api/auth/logout/route.ts'), 'utf8')
const rateLimitSource = readFileSync(join(process.cwd(), 'lib/security/authRateLimit.ts'), 'utf8')

describe('email OTP auth routes', () => {
  it('OTP 요청은 rate limit 뒤에 Supabase 이메일 OTP를 사용하고 계정 존재를 노출하지 않는다', () => {
    expect(requestSource.indexOf("getAuthRateLimitKey('ip', ip)")).toBeLessThan(requestSource.indexOf('request.json()'))
    expect(requestSource.indexOf("getAuthRateLimitKey('email', parsed.data.email)")).toBeLessThan(requestSource.indexOf('client.auth.signInWithOtp'))
    expect(requestSource).toContain('client.auth.signInWithOtp')
    expect(requestSource).toContain('shouldCreateUser: launch.registrationEnabled')
    expect(requestSource).toContain('getPublicAccountLaunchState(client)')
    expect(requestSource).toContain('Account existence and provider errors are intentionally not disclosed')
  })

  it('OTP 검증 성공 후에만 httpOnly session cookie helper를 호출한다', () => {
    expect(verifySource.indexOf("getAuthRateLimitKey('ip', ip)")).toBeLessThan(verifySource.indexOf('request.json()'))
    expect(verifySource.indexOf("getAuthRateLimitKey('email', parsed.data.email)")).toBeLessThan(verifySource.indexOf('client.auth.verifyOtp'))
    expect(verifySource).toContain("type: 'email'")
    expect(verifySource).toContain('if (error || !data.session || !data.user)')
    expect(verifySource.lastIndexOf('setUserSessionCookies')).toBeGreaterThan(
      verifySource.indexOf('if (error || !data.session || !data.user)')
    )
  })

  it('OTP 검증 schema는 정확히 6자리 숫자만 허용한다', () => {
    const sixDigits = /^\d{6}$/
    expect(sixDigits.test('12345')).toBe(false)
    expect(sixDigits.test('123456')).toBe(true)
    expect(sixDigits.test('1234567')).toBe(false)
    expect(sixDigits.test('12345678')).toBe(false)
    expect(sixDigits.test('12a456')).toBe(false)
    expect(verifySource).toContain('regex(/^\\d{6}$/)')
  })

  it('rate-limit 저장 key는 원본 IP·이메일 대신 SHA-256 digest를 사용한다', () => {
    expect(rateLimitSource).toContain("createHash('sha256')")
    expect(rateLimitSource).toContain("digest('hex')")
    expect(requestSource).toContain("getAuthRateLimitKey('email', parsed.data.email)")
    expect(verifySource).toContain("getAuthRateLimitKey('email', parsed.data.email)")
  })

  it('logout은 provider session 폐기를 시도한 뒤 로컬 쿠키를 항상 제거한다', () => {
    expect(logoutSource.indexOf('await revokeUserSession')).toBeLessThan(logoutSource.indexOf('clearUserSessionCookies(response)'))
    expect(logoutSource).toContain('USER_REFRESH_COOKIE')
  })
})
