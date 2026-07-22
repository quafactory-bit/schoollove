import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PHASE 7B COMPLETION PATCH — /search 화면이 학교 검색 함수만 호출하고(사람 검색 함수는
// 절대 호출하지 않고), URL 쿼리를 쓰지 않으며, §4가 요구하는 필수 상태를 모두 갖췄는지
// 소스 텍스트로 확인한다(이 저장소는 RTL/jsdom을 쓰지 않는다).
const source = readFileSync(join(process.cwd(), 'components', 'SchoolSearchResults.tsx'), 'utf-8')

describe('SchoolSearchResults — 학교 검색 함수만 호출한다', () => {
  it('searchSchools를 호출한다', () => {
    expect(source).toMatch(/searchSchools\(normalized\)/)
  })

  it('사람 검색 관련 함수(searchProfiles/searchAll)를 호출하지 않는다', () => {
    expect(source).not.toMatch(/searchProfiles/)
    expect(source).not.toMatch(/searchAll\(/)
  })

  it('학교 검색 로그(logSchoolSearch)만 기록하고, 사람 검색 로그 함수는 참조하지 않는다', () => {
    expect(source).toMatch(/void logSchoolSearch\(normalized, schools\.length\)/)
    expect(source).not.toMatch(/logSearch\(/)
  })
})

describe('SchoolSearchResults — URL query를 쓰지 않는다', () => {
  it('useSearchParams/router.push로 쿼리를 읽거나 쓰지 않는다', () => {
    expect(source).not.toMatch(/useSearchParams/)
    expect(source).not.toMatch(/router\.push/)
  })

  it('sessionStorage(SCHOOL_SEARCH_STORAGE_KEY)에서 검색어를 읽는다', () => {
    expect(source).toMatch(/sessionStorage\.getItem\(SCHOOL_SEARCH_STORAGE_KEY\)/)
  })

  it('/search?q= 형태의 문자열을 만들지 않는다', () => {
    expect(source).not.toMatch(/\/search\?q=/)
  })
})

describe('SchoolSearchResults — §4 필수 상태를 모두 렌더한다', () => {
  it("idle(검색어 없음) 상태 분기가 있다", () => {
    expect(source).toMatch(/status === 'idle'/)
  })

  it('loading 상태 분기가 있다', () => {
    expect(source).toMatch(/status === 'loading'/)
  })

  it('error(네트워크·검색 오류) 상태 분기와 재시도 버튼이 있다', () => {
    expect(source).toMatch(/status === 'error'/)
    expect(source).toMatch(/onClick={\(\) => runSearch\(query\)}/)
  })

  it('결과 없음 상태 분기가 있다', () => {
    expect(source).toMatch(/status === 'ok' && results\.length === 0/)
  })

  it('결과 있음 상태 분기가 있다', () => {
    expect(source).toMatch(/status === 'ok' && results\.length > 0/)
  })
})

describe('SchoolSearchResults — 학교 결과 카드가 요구된 필드를 포함한다', () => {
  it('학교 이름/지역/유형/School Hub 링크/등록 인원을 렌더한다', () => {
    expect(source).toMatch(/school\.school_name/)
    expect(source).toMatch(/school\.sido/)
    expect(source).toMatch(/schoolTypeLabel\(school\.school_type\)/)
    expect(source).toMatch(/href={`\/school\/\$\{school\.slug\}`}/)
    expect(source).toMatch(/school\.profile_count/)
  })
})

describe('SchoolSearchResults — 실행 단위 로그 dedupe', () => {
  it('executionRef로 가장 마지막 실행만 결과 반영·로그를 수행한다', () => {
    expect(source).toMatch(/executionRef\.current !== executionId/)
  })
})

describe('SchoolSearchResults — 검색 결과 색상 시스템 계약', () => {
  it('검색 결과 CTA와 결과 배지는 schoollove 토큰을 사용하고 원색 blue 유틸리티를 쓰지 않는다', () => {
    expect(source).toContain('bg-schoollove-text')
    expect(source).toContain('hover:border-schoollove-electric-blue')
    expect(source).toContain('bg-schoollove-neon-mint')
    expect(source).not.toMatch(/bg-blue|text-blue|border-blue|hover:border-blue/)
  })
})
