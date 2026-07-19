import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// app/page.test.ts / app/admin/page.test.ts와 동일한 패턴 — 이 저장소는 RTL/jsdom을 쓰지
// 않으므로 소스 텍스트를 직접 검사한다.
// PHASE 7B COMPLETION PATCH — SearchBar가 전체 검색 시 URL이 아니라 sessionStorage로
// 검색어를 전달하고, /search 자체 내부에서는 onFullSearch 콜백으로 재검색하는지 확인한다.
const source = readFileSync(join(process.cwd(), 'components', 'SearchBar.tsx'), 'utf-8')

describe('SearchBar — 전체 검색은 sessionStorage로만 검색어를 전달한다', () => {
  it('SCHOOL_SEARCH_STORAGE_KEY에 정규화된 검색어를 저장한다', () => {
    expect(source).toMatch(/sessionStorage\.setItem\(SCHOOL_SEARCH_STORAGE_KEY, normalized\)/)
  })

  it('router.push에 원본 query가 아니라 buildFullSearchHref(normalized)를 넘긴다(쿼리 없는 고정 경로)', () => {
    expect(source).toMatch(/router\.push\(buildFullSearchHref\(normalized\)\)/)
  })

  it('onFullSearch가 주어지면 router.push 대신 그 콜백을 호출한다', () => {
    expect(source).toMatch(/if \(onFullSearch\) \{\s*onFullSearch\(normalized\)/)
  })

  it('onFullSearch prop 타입이 정규화된 문자열 콜백으로 선언돼 있다', () => {
    expect(source).toMatch(/onFullSearch\?:\s*\(normalizedQuery: string\) => void/)
  })

  it('직접 /search?q= 형태의 문자열을 만들지 않는다', () => {
    expect(source).not.toMatch(/\/search\?q=/)
  })
})
