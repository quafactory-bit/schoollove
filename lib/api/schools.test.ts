import { afterEach, describe, expect, it, vi } from 'vitest'

type MockResult = { data?: unknown; error?: unknown }
type RecordedCall = { method: string; args: unknown[] }

// lib/api/profiles.test.ts와 동일한 패턴. admin Level Sync 도구의 학교 검색(searchSchools)과
// School ID 직접 조회(getSchoolById)가 실제로 의도한 쿼리를 보내는지 고정한다.
function createMockSupabase(script: MockResult[]) {
  const calls: RecordedCall[][] = []
  let cursor = 0

  function makeClient() {
    const from = vi.fn((_table: string) => {
      const record: RecordedCall[] = []
      calls.push(record)
      const result = script[cursor] ?? { data: null, error: new Error('unscripted call') }
      cursor++

      const chain: Record<string, (...args: unknown[]) => unknown> = {}
      for (const method of ['select', 'ilike', 'order', 'limit', 'eq']) {
        chain[method] = (...args: unknown[]) => {
          record.push({ method, args })
          return chain
        }
      }
      Object.assign(chain, {
        single: () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
        then: (resolve: (value: MockResult) => unknown) =>
          resolve({ data: result.data ?? null, error: result.error ?? null }),
      })
      return chain
    })
    const rpc = vi.fn()
    return { from, rpc }
  }

  return { supabase: makeClient(), supabaseServer: makeClient(), calls }
}

function findCall(record: RecordedCall[], method: string): RecordedCall | undefined {
  return record.find((c) => c.method === method)
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('searchSchools — admin Level Sync 도구 "학교 이름 검색" (시나리오 a)', () => {
  it('2글자 미만 검색어는 DB 조회 없이 빈 배열', async () => {
    const { supabase, supabaseServer, calls } = createMockSupabase([])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { searchSchools } = await import('./schools')

    const result = await searchSchools('', 10)

    expect(result).toEqual([])
    expect(calls.length).toBe(0)
  })

  it('검색 성공 시 school_name ilike + limit으로 결과를 그대로 반환', async () => {
    const rows = [{ id: 's1', school_name: '대치고등학교' }]
    const { supabase, supabaseServer, calls } = createMockSupabase([{ data: rows, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { searchSchools } = await import('./schools')

    const result = await searchSchools('대치', 10)

    expect(result).toEqual(rows)
    const ilikeCall = findCall(calls[0], 'ilike')
    expect(ilikeCall?.args).toEqual(['school_name', '%대치%'])
    const limitCall = findCall(calls[0], 'limit')
    expect(limitCall?.args).toEqual([10])
  })

  it('DB 오류 시 예외를 던지지 않고 빈 배열 반환', async () => {
    const { supabase, supabaseServer } = createMockSupabase([
      { data: null, error: { message: 'network error' } },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { searchSchools } = await import('./schools')

    await expect(searchSchools('대치', 10)).resolves.toEqual([])
  })
})

describe('getSchoolById — admin Level Sync 도구 "School ID로 직접 조회" (시나리오 b/c)', () => {
  it('b. 존재하는 School ID → 학교 객체 반환, id eq로 정확히 조회', async () => {
    const school = { id: 'school-1', school_name: '대치고등학교' }
    const { supabase, supabaseServer, calls } = createMockSupabase([{ data: school, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getSchoolById } = await import('./schools')

    const result = await getSchoolById('school-1')

    expect(result).toEqual(school)
    const eqCall = findCall(calls[0], 'eq')
    expect(eqCall?.args).toEqual(['id', 'school-1'])
  })

  it('c. 존재하지 않는 School ID → null (에러를 그대로 노출하지 않음)', async () => {
    const { supabase, supabaseServer } = createMockSupabase([
      { data: null, error: { message: 'no rows' } },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getSchoolById } = await import('./schools')

    await expect(getSchoolById('does-not-exist')).resolves.toBeNull()
  })
})

describe('getSchoolGrowthSnapshot — School Hub/Home 공용 성장 스냅샷 (읽기 전용)', () => {
  it('school row + profile count를 읽어 calculateSchoolGrowthSnapshot 결과를 그대로 반환', async () => {
    const schoolRow = {
      id: 'school-1',
      school_name: '대치고등학교',
      slug: 'daechi-high',
      current_level: null,
      level_updated_at: null,
    }
    // 순서: 1) schools select 2) profiles count(getSchoolProfileCount 내부, head:true 조회라 data는 사용 안 함)
    const { supabase, supabaseServer, calls } = createMockSupabase([
      { data: schoolRow, error: null },
      { data: null, error: null },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getSchoolGrowthSnapshot } = await import('./schools')

    const result = await getSchoolGrowthSnapshot('school-1')

    expect(result).not.toBeNull()
    expect(result?.schoolId).toBe('school-1')
    expect(result?.schoolName).toBe('대치고등학교')
    expect(result?.slug).toBe('daechi-high')
    expect(result?.storedCurrentLevel).toBeNull()
    expect(result?.effectiveLevel).toBe(result?.calculatedLevel)
    // 첫 호출은 schools 테이블, 두 번째 호출은 profiles 테이블(getSchoolProfileCount)
    expect(calls.length).toBe(2)
    const firstSelect = findCall(calls[0], 'select')
    expect(firstSelect?.args).toEqual(['id, school_name, slug, current_level, level_updated_at'])
  })

  it('school row 조회 실패 시 null 반환, profiles count는 조회하지 않음', async () => {
    const { supabase, supabaseServer, calls } = createMockSupabase([
      { data: null, error: { message: 'not found' } },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getSchoolGrowthSnapshot } = await import('./schools')

    const result = await getSchoolGrowthSnapshot('missing-school')

    expect(result).toBeNull()
    expect(calls.length).toBe(1) // schools 조회 1회만, profiles count 호출 없음
  })

  it('저장된 current_level이 계산 Level보다 높으면 effectiveLevel은 저장값을 그대로 유지', async () => {
    const schoolRow = {
      id: 'school-2',
      school_name: '작은학교',
      slug: 'small-school',
      current_level: 5,
      level_updated_at: '2026-01-01T00:00:00.000Z',
    }
    const { supabase, supabaseServer } = createMockSupabase([
      { data: schoolRow, error: null },
      { data: null, error: null },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getSchoolGrowthSnapshot } = await import('./schools')

    const result = await getSchoolGrowthSnapshot('school-2')

    expect(result?.storedCurrentLevel).toBe(5)
    expect(result?.effectiveLevel).toBe(5)
  })
})

describe('getWeeklySchoolGrowthRanking / getTodayFastestGrowingSchool — 주간/오늘 성장 순위 RPC 래퍼', () => {
  function rawRow(overrides: Record<string, unknown> = {}) {
    return {
      school_id: 's1',
      school_name: '가고등학교',
      slug: 'ga-high',
      new_visible_profiles: 3,
      most_recent_registration_at: '2026-07-15T00:00:00.000Z',
      current_level: 2,
      visible_profile_count: 20,
      ...overrides,
    }
  }

  it('a. 주간 순위 정상 5개 → rank 1~5로 매겨져 반환됨', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      rawRow({ school_id: `s${i}`, school_name: `${i}고`, new_visible_profiles: 5 - i })
    )
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking } = await import('./schools')

    const result = await getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))

    expect(result).toHaveLength(5)
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5])
  })

  it('b. 실제 학교가 3개면 3개만 반환', async () => {
    const rows = [rawRow({ school_id: 's1' }), rawRow({ school_id: 's2' }), rawRow({ school_id: 's3' })]
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking } = await import('./schools')

    const result = await getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))

    expect(result).toHaveLength(3)
  })

  it('c. 0건이면 빈 배열(가짜 학교로 채우지 않음)', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking } = await import('./schools')

    const result = await getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))

    expect(result).toEqual([])
  })

  it('d. 동률 시 최근 등록 시각 우선(래퍼가 RPC 결과를 다시 한번 정렬 규칙에 맞게 보장)', async () => {
    const rows = [
      rawRow({ school_id: 'old', new_visible_profiles: 5, most_recent_registration_at: '2026-07-10T00:00:00.000Z' }),
      rawRow({ school_id: 'new', new_visible_profiles: 5, most_recent_registration_at: '2026-07-14T00:00:00.000Z' }),
    ]
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking } = await import('./schools')

    const result = await getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))

    expect(result.map((r) => r.schoolId)).toEqual(['new', 'old'])
  })

  it('e. 신규 수·등록 시각도 같으면 학교명 오름차순', async () => {
    const sameTime = '2026-07-14T00:00:00.000Z'
    const rows = [
      rawRow({ school_id: 'b', school_name: '나고', new_visible_profiles: 2, most_recent_registration_at: sameTime }),
      rawRow({ school_id: 'a', school_name: '가고', new_visible_profiles: 2, most_recent_registration_at: sameTime }),
    ]
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking } = await import('./schools')

    const result = await getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))

    expect(result.map((r) => r.schoolId)).toEqual(['a', 'b'])
  })

  // f. hidden 프로필 제외, g. 기간 밖 프로필 제외는 SQL 자체의 정적 검증 대상이며
  // supabase/migrations/20260715120000_school_growth_ranking_rpc.test.ts에서 확인한다.

  it('h. today 결과 1개 반환(배열이 아닌 단일 객체)', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [rawRow({ school_id: 'today-1' })], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getTodayFastestGrowingSchool } = await import('./schools')

    const result = await getTodayFastestGrowingSchool(new Date('2026-07-15T05:00:00.000Z'))

    expect(result).not.toBeNull()
    expect(result?.schoolId).toBe('today-1')
  })

  it('i. today 0건이면 null(가짜 기본 학교 반환하지 않음)', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getTodayFastestGrowingSchool } = await import('./schools')

    const result = await getTodayFastestGrowingSchool(new Date('2026-07-15T05:00:00.000Z'))

    expect(result).toBeNull()
  })

  it('j. RPC 오류 시 예외를 던지지 않고 빈 배열/null 반환', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: null, error: { message: 'db error' } })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking, getTodayFastestGrowingSchool } = await import('./schools')

    await expect(getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))).resolves.toEqual([])
    await expect(getTodayFastestGrowingSchool(new Date('2026-07-15T00:00:00.000Z'))).resolves.toBeNull()
  })

  it('k. 잘못된 count 타입(음수/문자열 파싱 불가)인 행은 조용히 왜곡하지 않고 건너뜀', async () => {
    const rows = [
      rawRow({ school_id: 'valid', new_visible_profiles: 3 }),
      rawRow({ school_id: 'bad-count', new_visible_profiles: 'not-a-number' }),
      rawRow({ school_id: 'negative-count', visible_profile_count: -1 }),
    ]
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: rows, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking } = await import('./schools')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))

    expect(result.map((r) => r.schoolId)).toEqual(['valid'])
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('l. p_limit이 주간은 5, 오늘은 1로 RPC에 정확히 전달됨', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking, getTodayFastestGrowingSchool } = await import('./schools')

    await getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))
    await getTodayFastestGrowingSchool(new Date('2026-07-15T00:00:00.000Z'))

    expect(supabaseServer.rpc).toHaveBeenNthCalledWith(
      1,
      'school_growth_ranking_v1',
      expect.objectContaining({ p_limit: 5 })
    )
    expect(supabaseServer.rpc).toHaveBeenNthCalledWith(
      2,
      'school_growth_ranking_v1',
      expect.objectContaining({ p_limit: 1 })
    )
  })

  it('p_since는 주간은 now-7일, 오늘은 Asia/Seoul 오늘 00:00(UTC)로 정확히 전달됨', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking, getTodayFastestGrowingSchool } = await import('./schools')

    const now = new Date('2026-07-15T05:00:00.000Z') // KST 2026-07-15T14:00:00
    await getWeeklySchoolGrowthRanking(now)
    await getTodayFastestGrowingSchool(now)

    expect(supabaseServer.rpc).toHaveBeenNthCalledWith(
      1,
      'school_growth_ranking_v1',
      expect.objectContaining({ p_since: '2026-07-08T05:00:00.000Z' })
    )
    expect(supabaseServer.rpc).toHaveBeenNthCalledWith(
      2,
      'school_growth_ranking_v1',
      expect.objectContaining({ p_since: '2026-07-14T15:00:00.000Z' })
    )
  })

  it('m. 각 행에 visibleProfileCount(RPC의 visible_profile_count)가 그대로 포함된다', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [rawRow({ visible_profile_count: 6 })], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRanking } = await import('./schools')

    const result = await getWeeklySchoolGrowthRanking(new Date('2026-07-15T00:00:00.000Z'))

    expect(result[0].visibleProfileCount).toBe(6)
  })
})

describe('getWeeklySchoolGrowthRankingWithStatus — Home 순위 섹션 오류/빈 상태 구분', () => {
  function rawRow(overrides: Record<string, unknown> = {}) {
    return {
      school_id: 's1',
      school_name: '가고등학교',
      slug: 'ga-high',
      new_visible_profiles: 3,
      most_recent_registration_at: '2026-07-15T00:00:00.000Z',
      current_level: 2,
      visible_profile_count: 6,
      ...overrides,
    }
  }

  it('RPC 오류 시 status: "error"를 반환한다(빈 배열로 위장하지 않음)', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: null, error: { message: 'db error' } })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRankingWithStatus } = await import('./schools')

    const result = await getWeeklySchoolGrowthRankingWithStatus(new Date('2026-07-15T00:00:00.000Z'))

    expect(result).toEqual({ status: 'error' })
  })

  it('실제 0건이면 status: "ok", rows: []를 반환한다(오류와 구분됨)', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRankingWithStatus } = await import('./schools')

    const result = await getWeeklySchoolGrowthRankingWithStatus(new Date('2026-07-15T00:00:00.000Z'))

    expect(result).toEqual({ status: 'ok', rows: [] })
  })

  it('정상 결과면 status: "ok"와 rank가 부여된 rows를 반환한다', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [rawRow()], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getWeeklySchoolGrowthRankingWithStatus } = await import('./schools')

    const result = await getWeeklySchoolGrowthRankingWithStatus(new Date('2026-07-15T00:00:00.000Z'))

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].rank).toBe(1)
      expect(result.rows[0].visibleProfileCount).toBe(6)
    }
  })
})

describe('getCurrentSchoolRankingWithStatus — 누적 공개 프로필 현재 순위', () => {
  it('전체 기간 시작 시각과 TOP 3 제한을 기존 집계 RPC에 전달한다', async () => {
    const { supabase, supabaseServer } = createMockSupabase([])
    supabaseServer.rpc.mockResolvedValue({ data: [], error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getCurrentSchoolRankingWithStatus } = await import('./schools')

    await getCurrentSchoolRankingWithStatus()

    expect(supabaseServer.rpc).toHaveBeenCalledWith('school_growth_ranking_v1', {
      p_since: '1970-01-01T00:00:00.000Z',
      p_limit: 3,
    })
  })
})
