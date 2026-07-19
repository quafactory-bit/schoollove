// School Search Autocomplete — Phase 4C 순수 로직
// docs/decisions/2026-07-17-school-search-autocomplete.md
// React 렌더링/DOM 없이 테스트 가능하도록 검색 상태(디바운스·오래된 응답 무시)·후보 제한·
// 키보드 이동·URL 생성을 이 모듈의 순수 함수/팩토리로 분리한다. 컴포넌트/훅은 이 모듈을
// 감싸는 얇은 glue 코드로만 존재한다.

export const AUTOCOMPLETE_MIN_QUERY_LENGTH = 2
export const AUTOCOMPLETE_MAX_RESULTS = 6
export const AUTOCOMPLETE_DEBOUNCE_MS = 250

export function normalizeAutocompleteQuery(raw: string): string {
  return raw.trim()
}

export function shouldFetchAutocomplete(query: string): boolean {
  return normalizeAutocompleteQuery(query).length >= AUTOCOMPLETE_MIN_QUERY_LENGTH
}

export function clampAutocompleteResults<T>(
  results: T[],
  max: number = AUTOCOMPLETE_MAX_RESULTS
): T[] {
  return results.slice(0, max)
}

export function buildSchoolHubHref(slug: string): string {
  return `/school/${slug}`
}

// PHASE 7B — docs/design-package-v1.0/08-search.md §5 "검색 쿼리를 URL 파라미터로
// 노출하지 않는다"를 따라 더 이상 검색어를 쿼리로 붙이지 않는다. app/search/page.tsx는
// searchParams를 받지 않으므로 이 함수가 반환하는 목적지는 항상 고정된 /search다 — query
// 인자는 시그니처 호환을 위해 유지하되 사용하지 않는다. 실제 검색어 전달은
// SCHOOL_SEARCH_STORAGE_KEY(sessionStorage)로 이루어진다(PHASE 7B COMPLETION PATCH,
// SearchBar.tsx의 navigateToFullSearch 참고).
export function buildFullSearchHref(_query: string): string {
  return '/search'
}

// PHASE 7B COMPLETION PATCH — SCHOOL SEARCH CONTINUITY
// URL query 없이 SearchBar → /search로 학교 검색어를 전달하기 위한 sessionStorage 키.
// 탭 단위로만 유지되고(새 탭/새로고침 후 새 세션에서는 비어 있음), 브라우저 히스토리나
// 서버 로그에는 남지 않는다 — "검색어를 URL에 노출하지 않는다"는 고정 결정을 지키면서
// 학교 검색 결과를 페이지 이동 이후에도 잃지 않기 위한 최소 수단으로 선택했다. React
// Context 등으로 상태를 들고 다니는 대안도 검토했으나, Home/Submit → /search는 서로 다른
// 라우트로의 실제 네비게이션이라 Context provider를 두 라우트에 걸쳐 공유하려면 레이아웃
// 구조를 바꿔야 해서 더 무겁고, sessionStorage는 새로고침·새 탭·저장값 없음 상태를
// 자연스럽게 표현할 수 있어 이 쪽이 더 단순하다.
export const SCHOOL_SEARCH_STORAGE_KEY = 'schoollove:school-search-query'

export type ArrowDirection = 'down' | 'up'

// activeIndex === -1은 "후보가 선택되지 않은 상태"(입력창 자체가 포커스 상태)를 뜻한다.
// 양 끝에서 반대쪽으로 순환한다(ArrowDown이 마지막 후보에서 첫 후보로, 그 반대도 동일).
export function moveActiveIndex(current: number, itemCount: number, direction: ArrowDirection): number {
  if (itemCount <= 0) return -1
  if (direction === 'down') {
    return current >= itemCount - 1 ? 0 : current + 1
  }
  return current <= 0 ? itemCount - 1 : current - 1
}

export type EnterAction =
  | { type: 'navigate-school'; href: string }
  | { type: 'search-all'; href: string }
  | { type: 'noop' }

// Enter 키 동작: 활성 후보가 있으면 School Hub로, 없으면 /search(검색어는 URL에 붙이지
// 않음, PHASE 7B)로. 검색어가 2글자 미만(완전히 비어 있는 경우 포함)이면 아무 것도 하지
// 않는다 — 자동완성 드롭다운 자체가 2글자 미만에서는 열리지 않는 것과 동일한 기준
// (AUTOCOMPLETE_MIN_QUERY_LENGTH)을 Enter 폴백에도 그대로 적용해, 짧은 검색어로 전체
// 검색이 실행되거나 sessionStorage에 저장되는 일이 없게 한다(PHASE 7B COMPLETION PATCH).
export function resolveEnterAction(
  query: string,
  activeIndex: number,
  resultSlugs: string[]
): EnterAction {
  if (activeIndex >= 0 && activeIndex < resultSlugs.length) {
    return { type: 'navigate-school', href: buildSchoolHubHref(resultSlugs[activeIndex]) }
  }
  const normalized = normalizeAutocompleteQuery(query)
  if (normalized.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) return { type: 'noop' }
  return { type: 'search-all', href: buildFullSearchHref(normalized) }
}

// ─── 디바운스 + 오래된 응답 무시 컨트롤러 ──────────────────────────
// setTimeout 기반 디바운스와 요청 순번(requestId) 기반 stale-response guard를
// React 없이 구현한다 — useEffect는 이 컨트롤러를 호출만 하는 얇은 wrapper가 된다.
export interface DebouncedAutocompleteSearcherOptions<T> {
  fetcher: (query: string) => Promise<T[]>
  debounceMs?: number
  minLength?: number
  onStart: () => void
  onResult: (results: T[]) => void
  onError: () => void
  // 검색어가 최소 길이 미만이라 조회 자체를 하지 않을 때 호출됨(드롭다운 숨김 상태로 전환).
  onSkip: () => void
}

export interface DebouncedAutocompleteSearcher {
  search: (query: string) => void
  cancel: () => void
}

export function createDebouncedAutocompleteSearcher<T>(
  options: DebouncedAutocompleteSearcherOptions<T>
): DebouncedAutocompleteSearcher {
  const debounceMs = options.debounceMs ?? AUTOCOMPLETE_DEBOUNCE_MS
  const minLength = options.minLength ?? AUTOCOMPLETE_MIN_QUERY_LENGTH

  let timer: ReturnType<typeof setTimeout> | null = null
  // 마지막으로 시작된 요청의 순번. 요청이 도착했을 때 이 값과 다르면(그 사이 더 최신
  // 검색이 시작됐으면) 결과를 버려서 "느린 이전 응답이 빠른 최신 응답을 덮어쓰는" 경쟁을 막는다.
  let requestId = 0

  function clearPendingTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function search(query: string) {
    clearPendingTimer()
    const normalized = query.trim()

    if (normalized.length < minLength) {
      // 진행 중이던 요청도 무효화 — 짧아진 검색어에 이전 요청의 결과가 뒤늦게 반영되지 않도록 한다.
      requestId++
      options.onSkip()
      return
    }

    timer = setTimeout(() => {
      const currentId = ++requestId
      options.onStart()
      options.fetcher(normalized).then(
        (results) => {
          if (currentId !== requestId) return
          options.onResult(results)
        },
        () => {
          if (currentId !== requestId) return
          options.onError()
        }
      )
    }, debounceMs)
  }

  function cancel() {
    clearPendingTimer()
    requestId++
  }

  return { search, cancel }
}
