import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Class Hub도 React Server Component라 렌더 테스트를 할 수 없다(JSX 트랜스폼 미설치).
// 소스 텍스트로 PHASE 8 SEO 계약을 확인한다.
const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')

describe('app/school/[slug]/[year]/[class]/page.tsx — PHASE 8 SEO 계약', () => {
  it('noindex 판단은 공통 정책 함수(isClassPageIndexable)만 쓰고 로컬 임계값 상수를 두지 않는다', () => {
    expect(SOURCE).toMatch(/getClassProfileCount/)
    expect(SOURCE).toMatch(/isClassPageIndexable\(count\)/)
    expect(SOURCE).not.toMatch(/const INDEX_THRESHOLD/)
  })

  it('페이지를 찾을 수 없을 때는 별도로 index:false, follow:false를 반환한다(무변경)', () => {
    expect(SOURCE).toMatch(/robots: \{ index: false, follow: false \}/)
  })

  it('metadata·canonical 생성 helper와 기존 pagination을 유지한다', () => {
    expect(SOURCE).toMatch(/getClassPageMetadata/)
    expect(SOURCE).toMatch(/const totalPages = Math\.ceil\(count \/ 20\)/)
    expect(SOURCE).toMatch(/\?page=\$\{page [+-] 1\}/)
  })

  it('실제 count로 “이 반에 N명이 등록했어요” 요약을 표시한다', () => {
    expect(SOURCE).toMatch(/이 반에 \{formatNumber\(count\)\}명이 등록했어요/)
  })

  it('사람 목록 또는 빈 상태 뒤에 하나의 공통 등록 CTA를 렌더한다', () => {
    const profileList = SOURCE.indexOf('<ProfileCard')
    const emptyState = SOURCE.indexOf('아직 등록된 사람이 없어요')
    const registerCta = SOURCE.indexOf('href={submitHref}')
    expect(profileList).toBeGreaterThan(-1)
    expect(emptyState).toBeGreaterThan(-1)
    expect(registerCta).toBeGreaterThan(profileList)
    expect(registerCta).toBeGreaterThan(emptyState)
    expect(SOURCE.match(/href=\{submitHref\}/g)).toHaveLength(1)
  })

  it('모든 Class 등록 상태가 같은 school/year/grade/class context helper를 공유한다', () => {
    expect(SOURCE).toMatch(/buildSubmitContextHref\(\{[\s\S]*school: slug,[\s\S]*year,[\s\S]*grade,[\s\S]*classNumber,[\s\S]*\}\)/)
    expect(SOURCE).not.toMatch(/href="\/submit"/)
  })
})
