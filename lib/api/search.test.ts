import { afterEach, describe, expect, it, vi } from 'vitest'

// lib/api/schools.test.ts와 동일한 mock 패턴을 재사용한다.
function createMockSupabase(rpcResult: { data?: unknown; error?: unknown }) {
  const fromCalls: string[] = []
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  const from = vi.fn((table: string) => {
    fromCalls.push(table)
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    for (const method of ['select', 'eq']) {
      chain[method] = () => chain
    }
    chain.then = (...args: unknown[]) => {
      const resolve = args[0] as (value: { count: number; error: null }) => unknown
      return resolve({ count: 0, error: null })
    }
    return chain
  })
  return { supabase: { rpc, from }, rpc, from, fromCalls }
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('searchSchoolsForAutocomplete — Phase 4C 자동완성 전용 조회', () => {
  it('2글자 미만 검색어는 RPC를 호출하지 않고 빈 배열을 반환한다 (테스트 항목 1)', async () => {
    const { supabase, rpc } = createMockSupabase({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { searchSchoolsForAutocomplete } = await import('./search')

    const result = await searchSchoolsForAutocomplete('가')

    expect(result).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('2글자 이상이면 search_schools_v2 RPC를 lim=6으로 호출한다 (테스트 항목 2, 3)', async () => {
    const rows = [
      { id: 's1', school_name: '대치고등학교', school_type: 'high', sido: '서울', sigungu: '강남구', slug: 'daechi-high', address: '', school_code: '', created_at: '' },
    ]
    const { supabase, rpc } = createMockSupabase({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { searchSchoolsForAutocomplete } = await import('./search')

    const result = await searchSchoolsForAutocomplete('대치')

    expect(rpc).toHaveBeenCalledWith('search_schools_v2', { q: '대치', lim: 6 })
    expect(result).toEqual([
      { id: 's1', school_name: '대치고등학교', school_type: 'high', sido: '서울', sigungu: '강남구', slug: 'daechi-high' },
    ])
  })

  it('앞뒤 공백을 제거한 검색어로 RPC를 호출한다', async () => {
    const { supabase, rpc } = createMockSupabase({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { searchSchoolsForAutocomplete } = await import('./search')

    await searchSchoolsForAutocomplete('  대치고  ')

    expect(rpc).toHaveBeenCalledWith('search_schools_v2', { q: '대치고', lim: 6 })
  })

  it('결과는 school_name/school_type/sido/sigungu/slug만 포함하고 개인 데이터(profile_count 등)를 포함하지 않는다 (테스트 항목 21)', async () => {
    const rows = [
      {
        id: 's1',
        school_name: '대치고등학교',
        school_type: 'high',
        sido: '서울',
        sigungu: '강남구',
        slug: 'daechi-high',
        address: '서울시 강남구 대치동',
        school_code: 'CODE1',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]
    const { supabase } = createMockSupabase({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { searchSchoolsForAutocomplete } = await import('./search')

    const result = await searchSchoolsForAutocomplete('대치')

    expect(Object.keys(result[0]).sort()).toEqual(
      ['id', 'school_name', 'school_type', 'sido', 'sigungu', 'slug'].sort()
    )
  })

  it('RPC가 최대 6개까지만 반환한다고 가정해도 profiles 테이블은 조회하지 않는다 — N+1 없음 (테스트 항목 3)', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      school_name: `학교${i}`,
      school_type: 'high',
      sido: '서울',
      sigungu: '강남구',
      slug: `school-${i}`,
      address: '',
      school_code: '',
      created_at: '',
    }))
    const { supabase, from } = createMockSupabase({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { searchSchoolsForAutocomplete } = await import('./search')

    const result = await searchSchoolsForAutocomplete('학교')

    expect(result).toHaveLength(6)
    expect(from).not.toHaveBeenCalled()
  })

  it('RPC 오류 시 예외를 던지지 않고 빈 배열을 반환한다 (테스트 항목 18)', async () => {
    const { supabase } = createMockSupabase({ data: null, error: { message: 'db error' } })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { searchSchoolsForAutocomplete } = await import('./search')

    await expect(searchSchoolsForAutocomplete('대치고')).resolves.toEqual([])
  })
})

describe('searchSchools — 기존 전체 검색 계약 회귀 없음 확인 (테스트 항목 22)', () => {
  it('여전히 search_schools_v2를 lim=20으로 호출하고 profile_count를 포함한다', async () => {
    const rows = [
      { id: 's1', school_name: '대치고등학교', school_type: 'high', sido: '서울', sigungu: '강남구', slug: 'daechi-high', address: '', school_code: '', created_at: '' },
    ]
    const { supabase, rpc } = createMockSupabase({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { searchSchools } = await import('./search')

    const result = await searchSchools('대치')

    expect(rpc).toHaveBeenCalledWith('search_schools_v2', { q: '대치', lim: 20 })
    expect(result[0]).toMatchObject({ id: 's1', school_name: '대치고등학교', profile_count: 0 })
  })

  it('2글자 미만 검색어는 여전히 빈 배열을 반환한다', async () => {
    const { supabase, rpc } = createMockSupabase({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { searchSchools } = await import('./search')

    await expect(searchSchools('가')).resolves.toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})

// PHASE 7B COMPLETION PATCH — 학교 검색 로그 복구(logSearch → logSchoolSearch로 개명).
// docs/decisions/2026-07-17-search-logs-aggregate-rpc.md #4가 그대로 두라고 한 INSERT
// 계약(컬럼 query/result_count)을 재사용하는지, 사람 검색과 무관하게 학교 검색에서만
// 쓰이는지, 실패해도 예외를 던지지 않는지를 확인한다.
function createInsertMockSupabase(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult)
  const from = vi.fn((_table: string) => ({ insert }))
  return { supabase: { from }, from, insert }
}

describe('logSchoolSearch — PHASE 7B COMPLETION PATCH 학교 검색 로그 복구', () => {
  it('2글자 이상이면 search_logs에 query/result_count만 insert한다', async () => {
    const { supabase, from, insert } = createInsertMockSupabase()
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { logSchoolSearch } = await import('./search')

    await logSchoolSearch('대치고', 3)

    expect(from).toHaveBeenCalledWith('search_logs')
    expect(insert).toHaveBeenCalledWith({ query: '대치고', result_count: 3 })
  })

  it('앞뒤 공백을 제거한 뒤 기록한다', async () => {
    const { supabase, insert } = createInsertMockSupabase()
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { logSchoolSearch } = await import('./search')

    await logSchoolSearch('  대치고  ', 3)

    expect(insert).toHaveBeenCalledWith({ query: '대치고', result_count: 3 })
  })

  it('2글자 미만이면 insert를 호출하지 않는다', async () => {
    const { supabase, insert } = createInsertMockSupabase()
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { logSchoolSearch } = await import('./search')

    await logSchoolSearch('가', 0)

    expect(insert).not.toHaveBeenCalled()
  })

  it('100자를 초과하면 insert를 호출하지 않는다', async () => {
    const { supabase, insert } = createInsertMockSupabase()
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { logSchoolSearch } = await import('./search')

    await logSchoolSearch('가'.repeat(101), 0)

    expect(insert).not.toHaveBeenCalled()
  })

  it('insert 실패(reject)해도 예외를 던지지 않는다(fire-and-forget)', async () => {
    const from = vi.fn(() => ({ insert: vi.fn().mockRejectedValue(new Error('network down')) }))
    vi.doMock('@/lib/supabase', () => ({ supabase: { from } }))
    const { logSchoolSearch } = await import('./search')

    await expect(logSchoolSearch('대치고', 3)).resolves.toBeUndefined()
  })
})
