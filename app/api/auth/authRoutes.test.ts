import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const requestSource = readFileSync(join(process.cwd(), 'app/api/auth/request-otp/route.ts'), 'utf8')
const verifySource = readFileSync(join(process.cwd(), 'app/api/auth/verify-otp/route.ts'), 'utf8')
const logoutSource = readFileSync(join(process.cwd(), 'app/api/auth/logout/route.ts'), 'utf8')

describe('Google-only auth route boundaries', () => {
  it('keeps both removed email OTP endpoints uniformly dark', () => {
    for (const source of [requestSource, verifySource]) {
      expect(source).toContain('status: 404')
      expect(source).not.toMatch(/signInWithOtp|verifyOtp|createUser|setUserSessionCookies/)
    }
  })

  it('does not parse caller input or disclose provider or account state', () => {
    for (const source of [requestSource, verifySource]) {
      expect(source).not.toMatch(/request\.json|request\.text|searchParams|headers\.get/)
      expect(source).not.toMatch(/account exists|provider error|user not found/i)
    }
  })

  it('logout은 provider session 폐기를 시도한 뒤 로컬 쿠키를 항상 제거한다', () => {
    expect(logoutSource.indexOf('await revokeUserSession')).toBeLessThan(logoutSource.indexOf('clearUserSessionCookies(response)'))
    expect(logoutSource).toContain('USER_REFRESH_COOKIE')
  })
})
