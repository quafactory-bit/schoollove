import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOCOMPLETE_MAX_RESULTS,
  AUTOCOMPLETE_MIN_QUERY_LENGTH,
  buildFullSearchHref,
  buildSchoolHubHref,
  clampAutocompleteResults,
  createDebouncedAutocompleteSearcher,
  moveActiveIndex,
  normalizeAutocompleteQuery,
  resolveEnterAction,
  SCHOOL_SEARCH_STORAGE_KEY,
  shouldFetchAutocomplete,
} from './schoolSearchAutocomplete'

describe('normalizeAutocompleteQuery / shouldFetchAutocomplete', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeAutocompleteQuery('  대치고  ')).toBe('대치고')
  })

  it('2글자 미만이면 조회하지 않는다 (테스트 항목 1, 19)', () => {
    expect(shouldFetchAutocomplete('가')).toBe(false)
    expect(shouldFetchAutocomplete(' 가 ')).toBe(false)
    expect(shouldFetchAutocomplete('')).toBe(false)
    expect(AUTOCOMPLETE_MIN_QUERY_LENGTH).toBe(2)
  })

  it('2글자 이상이면 조회한다 (테스트 항목 2)', () => {
    expect(shouldFetchAutocomplete('대치')).toBe(true)
    expect(shouldFetchAutocomplete('  대치고  ')).toBe(true)
  })
})

describe('clampAutocompleteResults — 최대 6개 제한 (테스트 항목 3)', () => {
  it('6개 초과 결과를 6개로 자른다', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    expect(clampAutocompleteResults(items)).toEqual([0, 1, 2, 3, 4, 5])
    expect(AUTOCOMPLETE_MAX_RESULTS).toBe(6)
  })

  it('6개 이하는 그대로 반환한다', () => {
    expect(clampAutocompleteResults([1, 2, 3])).toEqual([1, 2, 3])
  })
})

describe('buildSchoolHubHref / buildFullSearchHref — URL 생성 (테스트 항목 9, 13)', () => {
  it('School Hub URL은 /school/[slug] 형태다', () => {
    expect(buildSchoolHubHref('daechi-high')).toBe('/school/daechi-high')
  })

  it('PHASE 7B: 전체 검색 URL은 검색어를 쿼리로 붙이지 않고 항상 고정된 /search다(URL 노출 금지)', () => {
    expect(buildFullSearchHref('대치고')).toBe('/search')
  })

  it('어떤 입력값을 넣어도 결과 URL에 그 값이 포함되지 않는다(사람 이름이 섞여도 동일)', () => {
    expect(buildFullSearchHref('홍길동')).toBe('/search')
    expect(buildFullSearchHref('')).toBe('/search')
    expect(buildFullSearchHref('  ')).toBe('/search')
  })
})

describe('moveActiveIndex — 키보드 이동 (테스트 항목 10, 11)', () => {
  it('ArrowDown: 다음 후보로 이동, 마지막에서 처음으로 순환', () => {
    expect(moveActiveIndex(-1, 3, 'down')).toBe(0)
    expect(moveActiveIndex(0, 3, 'down')).toBe(1)
    expect(moveActiveIndex(2, 3, 'down')).toBe(0)
  })

  it('ArrowUp: 이전 후보로 이동, 처음에서 마지막으로 순환', () => {
    expect(moveActiveIndex(-1, 3, 'up')).toBe(2)
    expect(moveActiveIndex(1, 3, 'up')).toBe(0)
    expect(moveActiveIndex(0, 3, 'up')).toBe(2)
  })

  it('후보가 없으면 -1을 유지한다', () => {
    expect(moveActiveIndex(-1, 0, 'down')).toBe(-1)
    expect(moveActiveIndex(-1, 0, 'up')).toBe(-1)
  })
})

describe('resolveEnterAction — Enter 동작 (테스트 항목 12, 13)', () => {
  it('활성 후보가 있으면 School Hub로 이동한다', () => {
    const action = resolveEnterAction('대치', 1, ['a-high', 'b-high', 'c-high'])
    expect(action).toEqual({ type: 'navigate-school', href: '/school/b-high' })
  })

  it('활성 후보가 없으면 기존 /search?q= 전체 검색을 실행한다', () => {
    const action = resolveEnterAction('대치고', -1, ['a-high'])
    expect(action).toEqual({ type: 'search-all', href: buildFullSearchHref('대치고') })
  })

  it('검색어가 비어 있으면 아무 것도 하지 않는다', () => {
    expect(resolveEnterAction('   ', -1, [])).toEqual({ type: 'noop' })
  })

  it('activeIndex가 결과 범위를 벗어나면 전체 검색으로 폴백한다', () => {
    const action = resolveEnterAction('대치고', 5, ['a-high'])
    expect(action).toEqual({ type: 'search-all', href: buildFullSearchHref('대치고') })
  })

  it('PHASE 7B COMPLETION PATCH: 검색어가 2글자 미만이면(활성 후보 없어도) 전체 검색을 실행하지 않는다', () => {
    expect(resolveEnterAction('가', -1, [])).toEqual({ type: 'noop' })
    expect(resolveEnterAction(' 가 ', -1, ['a-high'])).toEqual({ type: 'noop' })
  })

  it('2글자 이상이면 전체 검색을 실행한다', () => {
    const action = resolveEnterAction('가나', -1, [])
    expect(action).toEqual({ type: 'search-all', href: buildFullSearchHref('가나') })
  })
})

describe('SCHOOL_SEARCH_STORAGE_KEY — PHASE 7B COMPLETION PATCH', () => {
  it('프로젝트 전용의 고정된 문자열 키다', () => {
    expect(SCHOOL_SEARCH_STORAGE_KEY).toBe('schoollove:school-search-query')
  })
})

describe('createDebouncedAutocompleteSearcher — 디바운스/오래된 응답 무시 (테스트 항목 4, 5, 16, 17, 18)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('2글자 미만이면 fetcher를 호출하지 않고 onSkip만 호출한다 (테스트 항목 1)', () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const onSkip = vi.fn()
    const onStart = vi.fn()
    const controller = createDebouncedAutocompleteSearcher({
      fetcher,
      onStart,
      onResult: vi.fn(),
      onError: vi.fn(),
      onSkip,
    })

    controller.search('가')
    vi.advanceTimersByTime(1000)

    expect(fetcher).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('기본 debounce(250ms) 이전에는 fetcher를 호출하지 않는다 (테스트 항목 4)', () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const controller = createDebouncedAutocompleteSearcher({
      fetcher,
      onStart: vi.fn(),
      onResult: vi.fn(),
      onError: vi.fn(),
      onSkip: vi.fn(),
    })

    controller.search('대치고')
    vi.advanceTimersByTime(249)
    expect(fetcher).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('대치고')
  })

  it('debounce 시간 내에 검색어가 바뀌면 이전 타이머를 취소하고 마지막 검색어만 조회한다', () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const controller = createDebouncedAutocompleteSearcher({
      fetcher,
      onStart: vi.fn(),
      onResult: vi.fn(),
      onError: vi.fn(),
      onSkip: vi.fn(),
    })

    controller.search('대')
    controller.search('대치')
    controller.search('대치고')
    vi.advanceTimersByTime(250)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('대치고')
  })

  it('검색 시작 시 onStart를 호출한다 (테스트 항목 16 — 검색 중 상태)', () => {
    const onStart = vi.fn()
    const controller = createDebouncedAutocompleteSearcher({
      fetcher: vi.fn().mockResolvedValue([]),
      onStart,
      onResult: vi.fn(),
      onError: vi.fn(),
      onSkip: vi.fn(),
    })

    controller.search('대치고')
    vi.advanceTimersByTime(250)

    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('빠른 검색어 변경 시 먼저 시작됐지만 늦게 도착한 응답은 무시한다 (테스트 항목 5)', async () => {
    let resolveFirst: (value: string[]) => void = () => {}
    const firstPromise = new Promise<string[]>((resolve) => {
      resolveFirst = resolve
    })
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => Promise.resolve(['second-result']))

    const onResult = vi.fn()
    const controller = createDebouncedAutocompleteSearcher({
      fetcher,
      onStart: vi.fn(),
      onResult,
      onError: vi.fn(),
      onSkip: vi.fn(),
    })

    // 첫 번째 검색 시작(디바운스 통과, fetch 진행 중 — 아직 resolve 안 됨)
    controller.search('대치고')
    await vi.advanceTimersByTimeAsync(250)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // 사용자가 빠르게 검색어를 바꿔 두 번째 검색이 먼저 완료된다
    controller.search('서울고')
    await vi.advanceTimersByTimeAsync(250)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(['second-result'])

    // 이제서야 느렸던 첫 번째 응답이 도착 — 무시되어야 한다(두 번째 결과를 덮어쓰지 않음)
    resolveFirst(['stale-first-result'])
    await Promise.resolve()
    await Promise.resolve()

    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).not.toHaveBeenCalledWith(['stale-first-result'])
  })

  it('0건 결과는 onResult([])로 전달된다 (테스트 항목 17 — 0건 상태)', async () => {
    const onResult = vi.fn()
    const controller = createDebouncedAutocompleteSearcher({
      fetcher: vi.fn().mockResolvedValue([]),
      onStart: vi.fn(),
      onResult,
      onError: vi.fn(),
      onSkip: vi.fn(),
    })

    controller.search('없는학교이름')
    await vi.advanceTimersByTimeAsync(250)

    expect(onResult).toHaveBeenCalledWith([])
  })

  it('fetcher가 실패하면 onError만 호출되고 예외를 던지지 않는다 (테스트 항목 18 — 오류 시 기존 검색 유지)', async () => {
    const onError = vi.fn()
    const onResult = vi.fn()
    const controller = createDebouncedAutocompleteSearcher({
      fetcher: vi.fn().mockRejectedValue(new Error('network error')),
      onStart: vi.fn(),
      onResult,
      onError,
      onSkip: vi.fn(),
    })

    controller.search('대치고')
    await vi.advanceTimersByTimeAsync(250)
    await Promise.resolve()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onResult).not.toHaveBeenCalled()
  })

  it('cancel() 이후 도착하는 응답은 무시한다', async () => {
    let resolveFetch: (value: string[]) => void = () => {}
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFetch = resolve
        })
    )
    const onResult = vi.fn()
    const controller = createDebouncedAutocompleteSearcher({
      fetcher,
      onStart: vi.fn(),
      onResult,
      onError: vi.fn(),
      onSkip: vi.fn(),
    })

    controller.search('대치고')
    await vi.advanceTimersByTimeAsync(250)
    controller.cancel()
    resolveFetch(['too-late'])
    await Promise.resolve()
    await Promise.resolve()

    expect(onResult).not.toHaveBeenCalled()
  })
})
