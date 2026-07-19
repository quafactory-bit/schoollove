import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Year Hub는 React Server Component라 app/page.test.ts와 동일한 이유로 직접 렌더링
// 테스트를 할 수 없다(JSX 트랜스폼 미설치). 소스 텍스트로 PHASE 7B 핵심 계약을 확인한다.
// 집계·상태 판단 로직 자체는 lib/policy/yearHub.test.ts가 전수 검증한다.
const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')

describe('app/school/[slug]/[year]/page.tsx — PHASE 7B People Discovery 계약', () => {
  it('페이지네이션 searchParams(?page=)를 더 이상 사용하지 않는다(전체 명단 로드로 전환)', () => {
    expect(SOURCE).not.toMatch(/searchParams/)
  })

  it('getAllProfilesBySchoolYear로 기수 전체 명단을 한 번에 로드한다', () => {
    expect(SOURCE).toMatch(/getAllProfilesBySchoolYear\(school\.id, year\)/)
  })

  it('noindex 임계값 계산(getYearProfileCount, INDEX_THRESHOLD=3)은 그대로 유지한다(SEO 회귀 없음)', () => {
    expect(SOURCE).toMatch(/getYearProfileCount/)
    expect(SOURCE).toMatch(/const INDEX_THRESHOLD = 3/)
  })

  it('반별 집계·가장 활발한 반·최근 등록·기수 상태를 정책 함수로 계산한다(컴포넌트에 로직을 두지 않음)', () => {
    expect(SOURCE).toMatch(/aggregateClassCounts\(profiles\)/)
    expect(SOURCE).toMatch(/pickMostActiveClass\(classes\)/)
    expect(SOURCE).toMatch(/pickMostRecentRegistration\(profiles\)/)
    expect(SOURCE).toMatch(/classifyYearState\(profiles\.length\)/)
  })

  it("state === 'empty'일 때 YearPeopleSearch(이름 검색)를 렌더하지 않는다", () => {
    const emptyBranchMatch = SOURCE.match(/state === 'empty' \? \(([\s\S]*?)\) : \(/)
    expect(emptyBranchMatch).not.toBeNull()
    expect(emptyBranchMatch![1]).not.toMatch(/YearPeopleSearch/)
  })

  it('empty가 아닌 상태에서는 YearPeopleSearch를 렌더한다', () => {
    expect(SOURCE).toMatch(/<YearPeopleSearch profiles=\{profiles\} \/>/)
  })

  it('School Hub로 돌아가는 링크를 유지한다', () => {
    expect(SOURCE).toMatch(/href=\{`\/school\/\$\{slug\}`\}/)
  })

  it('등록 CTA를 유지한다', () => {
    expect(SOURCE).toMatch(/href="\/submit"/)
  })

  it('Class Hub 링크 형식(/school/[slug]/[year]/[grade]-[class])을 그대로 유지한다', () => {
    expect(SOURCE).toMatch(/href=\{`\/school\/\$\{slug\}\/\$\{year\}\/\$\{c\.grade\}-\$\{c\.classNumber\}`\}/)
  })
})
