import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8')

describe('/login', () => {
  it('Google CTA 하나만 보이고 Supabase email OTP UI는 없다', () => {
    expect(source).toContain('Google로 계속하기')
    expect(source).toContain('href="/auth/social/start/google"')
    expect(source).not.toMatch(/request-otp|verify-otp|one-time-code|인증번호 받기|Kakao|Naver/)
  })

  it('단일 dark CTA는 상호작용 상태까지 보호하는 contrast 계약을 사용한다', () => {
    const darkActionButtons = source.match(/schoollove-dark-action schoollove-focus[^\"]*bg-schoollove-text[^\"]*text-white/g) ?? []
    expect(darkActionButtons).toHaveLength(1)
  })

  it('만 19세 이상과 self-attestation 한계를 고지한다', () => {
    expect(source).toContain('만 19세 이상')
    expect(source).toContain('신분증 기반 본인확인이 아닙니다')
  })
})
