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

export function buildFullSearchHref(query: string): string {
  return `/search?q=${encodeURIComponent(normalizeAutocompleteQuery(query))}`
}

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

// Enter 키 동작: 활성 후보가 있으면 School Hub로, 없으면 기존 /search?q= 전체 검색으로.
// 검색어가 완전히 비어 있으면 아무 것도 하지 않는다(빈 쿼리로 이동하지 않음).
export function resolveEnterAction(
  query: string,
  activeIndex: number,
  resultSlugs: string[]
): EnterAction {
  if (activeIndex >= 0 && activeIndex < resultSlugs.length) {
    return { type: 'navigate-school', href: buildSchoolHubHref(resultSlugs[activeIndex]) }
  }
  const normalized = normalizeAutocompleteQuery(query)
  if (!normalized) return { type: 'noop' }
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
