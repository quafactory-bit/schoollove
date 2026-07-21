import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// app/submit/page.tsx는 client 컴포넌트라 RTL/jsdom 없이 소스 텍스트로 PHASE 9 CAPTCHA
// 통합 계약을 확인한다(이 저장소의 기존 관례). registerPeople 자체의 동작은
// app/submit/registerPeople.test.ts가 전수 검증한다.
const SOURCE = readFileSync(join(process.cwd(), 'app', 'submit', 'page.tsx'), 'utf-8')

describe('app/submit/page.tsx — PHASE 9 CAPTCHA 통합', () => {
  it('CaptchaWidget을 렌더한다', () => {
    expect(SOURCE).toMatch(/<CaptchaWidget ref={captchaRef} siteKey={TURNSTILE_SITE_KEY}/)
  })

  it('공개 site key만 참조하고 비밀 키(TURNSTILE_SECRET_KEY) 문자열은 없다', () => {
    expect(SOURCE).toMatch(/NEXT_PUBLIC_TURNSTILE_SITE_KEY/)
    expect(SOURCE).not.toMatch(/TURNSTILE_SECRET_KEY/)
  })

  it('site key가 없으면 등록 UI 대신 명확한 오류 문구를 보여준다', () => {
    expect(SOURCE).toMatch(/지금은 등록 기능을 사용할 수 없어요/)
  })

  it('제출 버튼은 CAPTCHA가 ready 상태가 아니면 비활성화된다', () => {
    expect(SOURCE).toMatch(/disabled={submitting \|\| !TURNSTILE_SITE_KEY \|\| captchaStatus !== 'ready'}/)
  })

  it('handleSubmit은 registerPeople에 토큰 getter(captchaRef.requestNextToken)를 넘긴다', () => {
    expect(SOURCE).toMatch(/registerPeople\(valid, base, \(\) => \{/)
    expect(SOURCE).toMatch(/captchaRef\.current\.requestNextToken\(\)/)
  })

  it('captchaStatus가 ready가 아니면 제출을 막는 안내 문구가 있다', () => {
    expect(SOURCE).toMatch(/보안 확인을 먼저 완료해주세요/)
  })

  it('CAPTCHA 토큰을 URL/storage에 저장하지 않는다', () => {
    expect(SOURCE).not.toMatch(/localStorage/)
    expect(SOURCE).not.toMatch(/sessionStorage/)
  })
})
