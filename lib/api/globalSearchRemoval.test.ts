import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// PHASE 7B — 글로벌 인물 검색(searchProfiles/searchAll/logSearch)이 실제 export/코드
// 경로로 남아 있지 않은지, /search?q= 링크를 새로 만드는 컴포넌트가 없는지 확인한다.
// 설명 주석(이 파일 자신을 포함해)에는 옛 함수 이름이 그대로 등장할 수 있으므로,
// 주석이 아니라 실제 export 선언·코드 패턴만 정밀하게 매칭한다(단순 "파일 전체에서
// 문자열이 있는지"를 보면 이 설명 주석들 자체가 오탐이 된다).
// 학교 검색(searchSchools 계열)은 계속 살아있어야 하므로 별도로 확인한다.

const ROOT = process.cwd()

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, ...relativePath.split('/')), 'utf-8')
}

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      files.push(...listFilesRecursive(full))
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      files.push(full)
    }
  }
  return files
}

describe('lib/api/search.ts — 제거된 export가 실제로 없다', () => {
  const source = readSource('lib/api/search.ts')

  it('searchProfiles/searchAll/logSearch 함수를 더 이상 export하지 않는다', () => {
    expect(source).not.toMatch(/export\s+(async\s+)?function\s+searchProfiles/)
    expect(source).not.toMatch(/export\s+(async\s+)?function\s+searchAll/)
    expect(source).not.toMatch(/export\s+(async\s+)?function\s+logSearch/)
  })

  it('ProfileSearchResult 타입을 더 이상 export하지 않는다', () => {
    expect(source).not.toMatch(/export\s+interface\s+ProfileSearchResult/)
  })

  it('학교 검색 함수(searchSchools/searchSchoolsForAutocomplete)는 그대로 유지된다', () => {
    expect(source).toMatch(/export\s+async\s+function\s+searchSchools\(/)
    expect(source).toMatch(/export\s+async\s+function\s+searchSchoolsForAutocomplete\(/)
  })
})

describe('app/search/page.tsx — 쿼리를 다시 렌더하지 않는 정적 학교 검색 안내 페이지', () => {
  const source = readSource('app/search/page.tsx')

  it('SearchPage 컴포넌트가 searchParams를 props로 받지 않는다(설명 주석이 아니라 실제 함수 시그니처 확인)', () => {
    expect(source).toMatch(/export default function SearchPage\(\)\s*\{/)
    expect(source).not.toMatch(/interface\s+Props/)
  })

  it('SchoolSearchResults(학교 검색 결과 화면)를 렌더한다(학교 검색 기능 유지, PHASE 7B COMPLETION PATCH)', () => {
    expect(source).toMatch(/<SchoolSearchResults \/>/)
  })

  it('SchoolSearchResults는 실제로 SearchBar(school 검색 자동완성)를 렌더한다', () => {
    const resultsSource = readSource('components/SchoolSearchResults.tsx')
    expect(resultsSource).toMatch(/<SearchBar variant="search"/)
  })
})

describe('dead code 제거 — 글로벌 검색에 결합돼 있던 미사용 파일', () => {
  it('components/SubmitForm.tsx가 제거됐다', () => {
    expect(existsSync(join(ROOT, 'components', 'SubmitForm.tsx'))).toBe(false)
  })

  it('lib/hooks/useSchoolSearch.ts가 제거됐다', () => {
    expect(existsSync(join(ROOT, 'lib', 'hooks', 'useSchoolSearch.ts'))).toBe(false)
  })
})

describe("'/search?q=' 링크를 생성하는 코드가 없다", () => {
  // components/lib/app 전체를 스캔해 회귀를 막는다 — School Hub의 지역(sido) breadcrumb는
  // PHASE 7B FINAL MICRO PATCH에서 클릭 불가능한 일반 텍스트로 바뀌어(§2) 애초에 링크
  // 자체가 없으므로 예외 처리가 필요 없다.
  const targetFiles = [
    ...listFilesRecursive(join(ROOT, 'components')),
    ...listFilesRecursive(join(ROOT, 'lib')),
    ...listFilesRecursive(join(ROOT, 'app')),
  ]

  it('components/lib/app 어디에도 /search?q= 링크를 생성하는 코드가 없다', () => {
    for (const filePath of targetFiles) {
      const source = readFileSync(filePath, 'utf-8')
      expect(source, filePath).not.toMatch(/\/search\?q=/)
    }
  })
})

describe('app/school/[slug]/page.tsx — 지역(sido) 브레드크럼이 클릭 불가능한 일반 텍스트다(PHASE 7B FINAL MICRO PATCH)', () => {
  const source = readSource('app/school/[slug]/page.tsx')

  it('school.sido를 <span>으로만 렌더하고, sido를 감싸는 <Link>/<a>가 없다', () => {
    expect(source).toMatch(/<span>\{school\.sido\}<\/span>/)
    expect(source).not.toMatch(/encodeURIComponent\(school\.sido\)/)
    expect(source).not.toMatch(/<Link[^>]*>\s*\{school\.sido\}/)
  })

  it('sessionStorage를 사용하지 않는다(지역 검색을 새로 만들지 않음)', () => {
    expect(source).not.toMatch(/sessionStorage/)
  })
})

describe('SidoSearchLink — PHASE 7B FINAL MICRO PATCH에서 완전히 제거됐다', () => {
  it('components/SidoSearchLink.tsx/.test.ts 파일이 존재하지 않는다', () => {
    expect(existsSync(join(ROOT, 'components', 'SidoSearchLink.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'components', 'SidoSearchLink.test.ts'))).toBe(false)
  })

  it('components/lib/app 어디에도 SidoSearchLink 참조가 없다', () => {
    const targetFiles = [
      ...listFilesRecursive(join(ROOT, 'components')),
      ...listFilesRecursive(join(ROOT, 'lib')),
      ...listFilesRecursive(join(ROOT, 'app')),
    ]
    for (const filePath of targetFiles) {
      const source = readFileSync(filePath, 'utf-8')
      expect(source, filePath).not.toMatch(/SidoSearchLink/)
    }
  })
})
