import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PHASE 7B — YearPeopleSearch는 React Server Component가 아니라 client component지만
// 이 저장소는 RTL/jsdom을 쓰지 않으므로(app/submit 계열과 동일 관례) 실제 렌더링 대신
// 소스 텍스트로 핵심 계약(서버 호출 없음, URL 미사용, 정책 함수 재사용, 접근성 속성)을
// 확인한다. 실제 필터링 로직 자체는 lib/policy/yearHub.test.ts가 이미 전수 검증한다.
const SOURCE = readFileSync(join(process.cwd(), 'components', 'YearPeopleSearch.tsx'), 'utf-8')

describe('YearPeopleSearch touch targets', () => {
  it('keeps the search clear control at least 44 by 44 pixels', () => {
    expect(SOURCE).toContain('min-h-11 min-w-11')
    expect(SOURCE).toContain('pr-12')
  })
})

describe('YearPeopleSearch.tsx — 검색어 비서버·비URL 계약', () => {
  it('fetch/axios 등 네트워크 호출이 전혀 없다(검색이 순수 클라이언트 state로만 동작)', () => {
    expect(SOURCE).not.toMatch(/fetch\(/)
  })

  it('router/URL 관련 API를 사용하지 않는다(검색어를 URL에 반영하지 않음)', () => {
    expect(SOURCE).not.toMatch(/useRouter|useSearchParams|router\.push|URLSearchParams/)
  })

  it('lib/policy/yearHub의 filterProfilesByNickname을 재사용한다(필터 로직을 컴포넌트에 직접 두지 않음)', () => {
    expect(SOURCE).toMatch(/import \{ filterProfilesByNickname \} from '@\/lib\/policy\/yearHub'/)
  })

  it('검색 input에 접근 가능한 label/aria-label이 있다', () => {
    expect(SOURCE).toMatch(/aria-label="동기 이름으로 찾기"/)
    expect(SOURCE).toMatch(/htmlFor="year-people-search"/)
  })

  it('검색어 초기화(지우기) 버튼이 있다', () => {
    expect(SOURCE).toMatch(/aria-label="검색어 지우기"/)
    expect(SOURCE).toMatch(/setQuery\(''\)/)
  })

  it('결과 0건 상태 UI가 있다', () => {
    expect(SOURCE).toMatch(/일치하는 이름을 찾지 못했어요/)
  })

  it('기존 ProfileCard를 재사용한다(전용 신규 카드로 중복 구현하지 않음)', () => {
    expect(SOURCE).toMatch(/import ProfileCard from '\.\/ProfileCard'/)
    expect(SOURCE).toMatch(/<ProfileCard key=\{profile\.id\} profile=\{profile\} \/>/)
  })

  it('실제 기수 등록 인원을 동기 발견 제목에 표시하되 전체 표시를 단정하지 않는다', () => {
    expect(SOURCE).toMatch(/동기 \{formatNumber\(totalCount\)\}명 찾기/)
    expect(SOURCE).not.toMatch(/모두 표시|전체를 모두/)
  })

  it('검색어를 서버 로그·검색 로그에 남기는 어떤 호출도 하지 않는다(logSearch 등 import 없음)', () => {
    expect(SOURCE).not.toMatch(/logSearch/)
  })
})
