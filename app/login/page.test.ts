import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8')

describe('/login', () => {
  it('이메일 OTP 요청과 검증 경로를 사용한다', () => {
    expect(source).toContain("fetch('/api/auth/request-otp'")
    expect(source).toContain("fetch('/api/auth/verify-otp'")
    expect(source).toContain('autoComplete="one-time-code"')
  })

  it('만 19세 이상과 self-attestation 한계를 고지한다', () => {
    expect(source).toContain('만 19세 이상')
    expect(source).toContain('강한 본인확인이 아닙니다')
  })
})
