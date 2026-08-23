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

  it('6자리 숫자 OTP만 입력하고 8자리 붙여넣기를 조용히 제출하지 않는다', () => {
    expect(source).toContain('pattern="[0-9]{6}"')
    expect(source).toContain('maxLength={6}')
    expect(source).toContain('onPaste={rejectInvalidTokenPaste}')
    expect(source).toContain("if (/^\\d{6}$/.test(pasted)) return")
    expect(source).toContain("setStatus('인증번호는 숫자 6자리만 입력해 주세요.')")
    expect(source).not.toMatch(/magic[ -]?link/i)
  })

  it('두 dark CTA는 상호작용 상태까지 보호하는 기존 contrast 계약을 사용한다', () => {
    const darkActionButtons = source.match(/schoollove-dark-action schoollove-focus[^\"]*bg-gray-950[^\"]*text-white[^\"]*disabled:opacity-50/g) ?? []
    expect(darkActionButtons).toHaveLength(2)
    expect(source).toContain("{busy?'보내는 중…':'인증번호 받기'}")
    expect(source).toContain("{busy?'확인 중…':'로그인'}")
  })

  it('만 19세 이상과 self-attestation 한계를 고지한다', () => {
    expect(source).toContain('만 19세 이상')
    expect(source).toContain('신분증 기반 본인확인이 아닙니다')
  })
})
