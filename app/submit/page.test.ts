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

  it('제출 버튼은 기존 dark action의 흰색 글자 계약을 재사용한다', () => {
    const submitButton = SOURCE.match(/<button\s+onClick={handleSubmit}[\s\S]*?<\/button>/)?.[0] ?? ''

    expect(submitButton).toContain('schoollove-dark-action')
    expect(submitButton).toContain('bg-neutral-900')
    expect(submitButton).toContain('text-white')
    expect(submitButton).toContain('disabled:opacity-50')
    expect(submitButton).toContain("'등록하기'")
  })

  it('handleSubmit은 registerPeople에 토큰 getter(captchaRef.requestNextToken)를 넘긴다', () => {
    expect(SOURCE).toMatch(/registerPeople\(\s*valid,\s*base,\s*\(\) => \{/)
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

describe('app/submit/page.tsx mobile touch targets', () => {
  it('keeps the selected-school change button at a 44px minimum hit area', () => {
    expect(SOURCE).toMatch(/min-h-11 min-w-11/)
  })

  it('keeps person remove buttons and message preset chips at 44px minimum hit areas', () => {
    expect(SOURCE).toMatch(/inline-flex min-h-11 min-w-11 shrink-0/)
    expect(SOURCE).toMatch(/inline-flex min-h-11 items-center justify-center rounded-full/)
  })

  it('makes the instagram self-consent checkbox row a 44px label hit area', () => {
    expect(SOURCE).toMatch(/<label className="mt-2\.5 flex min-h-11 cursor-pointer/)
  })
})

describe('app/submit/page.tsx — 등록 대상별 한마디 입력', () => {
  it('이름 입력 여부와 관계없이 각 사람 카드에 선택 한마디 입력을 렌더한다', () => {
    expect(SOURCE).toMatch(/한마디 남기기 \(선택\)/)
    expect(SOURCE).toMatch(/기억을 도울 짧은 한마디를 남겨보세요/)
    expect(SOURCE).not.toMatch(/\{p\.nickname\.trim\(\) && \(/)
  })

  it('API 최대 길이 상수와 연결된 maxlength 및 길이 안내를 사용한다', () => {
    expect(SOURCE).toMatch(/maxLength=\{PROFILE_MESSAGE_MAX_LENGTH\}/)
    expect(SOURCE).toMatch(/\{p\.message\.length\}\/\{PROFILE_MESSAGE_MAX_LENGTH\}/)
  })
})

describe('app/submit/page.tsx — Year/Class context prefill', () => {
  it('순수 prefill helper를 사용하고 기존 self 계약을 helper 결과로 유지한다', () => {
    expect(SOURCE).toMatch(/parseSubmitPrefill\(searchParams\)/)
    expect(SOURCE).toMatch(/const selfMode = prefill\.selfMode/)
  })

  it('검증된 year/grade/class를 실제 form state 초기값에 사용한다', () => {
    expect(SOURCE).toMatch(/useState\(prefill\.graduationYear\)/)
    expect(SOURCE).toMatch(/useState\(prefill\.grade\)/)
    expect(SOURCE).toMatch(/useState\(prefill\.classNumber\)/)
  })

  it('학교 유형이 확인된 뒤 지원하지 않는 grade/class context를 제거한다', () => {
    expect(SOURCE).toMatch(/gradeForSchoolType\(prefill\.grade, selected\.school_type\)/)
    expect(SOURCE).toMatch(/selected\.school_type === 'university'/)
  })

  it('query 진입만으로 등록 요청을 실행하지 않는다', () => {
    const prefillEffect = SOURCE.match(/useEffect\(\(\) => \{[\s\S]*?prefill\.schoolSlug[\s\S]*?\}, \[\]\)/)?.[0] ?? ''
    expect(prefillEffect).not.toMatch(/registerPeople|POST \/api\/profiles|handleSubmit\(/)
  })
})

describe('app/submit/page.tsx — registration growth feedback', () => {
  it('guards against a second submit before issuing profile requests', () => {
    expect(SOURCE).toMatch(/if \(submittingRef\.current\) return/)
    expect(SOURCE).toMatch(/submittingRef\.current = true/)
    expect(SOURCE).toMatch(/submittingRef\.current = false/)
  })

  it('keeps the form and inputs when every request fails or is a duplicate', () => {
    const noSuccessBlock = SOURCE.match(/if \(success === 0\) \{[\s\S]*?\n      \}/)?.[0] ?? ''
    expect(noSuccessBlock).toContain('setErr(')
    expect(noSuccessBlock).not.toContain('setDone(')
    expect(noSuccessBlock).not.toContain('setPeople(')
    expect(noSuccessBlock).not.toContain('setSchool(')
  })

  it('uses the server growth snapshot for the school total before any safe fallback query', () => {
    expect(SOURCE).toContain('growthReward?.after.visibleProfileCount ?? null')
    expect(SOURCE).toMatch(/if \(!growthReward\) \{[\s\S]*?from\('profiles'\)/)
  })

  it('snapshots the final submitted context and delegates to one success component', () => {
    expect(SOURCE).toContain('context: {')
    expect(SOURCE).toContain('schoolSlug: school.slug')
    expect(SOURCE).toContain('graduationYear: base.graduation_year')
    expect(SOURCE).toContain('<RegistrationSuccessFeedback')
    expect(SOURCE).not.toContain('우리 학교 페이지에서 확인하기')
  })

  it('announces submission status and errors without automatic retry', () => {
    const submitFunction =
      SOURCE.match(/async function handleSubmit\(\) \{[\s\S]*?\n  \}\n\n  function shareSchool/)?.[0] ?? ''
    expect(SOURCE).toContain('role="status" aria-live="polite"')
    expect(SOURCE).toContain('role="alert" aria-live="polite"')
    expect(submitFunction).not.toContain('setTimeout(')
  })
})
