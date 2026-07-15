import { afterEach, describe, expect, it, vi } from 'vitest'

type MockResult = { data?: unknown; count?: number | null; error?: unknown }
type RecordedCall = { method: string; args: unknown[] }

// lib/api/levels.test.ts의 createMockAdmin과 동일한 패턴.
// School Hub/Year/Class 페이지와 Level Sync(cumulativeXp)가 모두 이 count 함수들을
// 공유하므로, 실제 쿼리 필터(school_id/is_hidden/graduation_year 등)가 의도한 그대로인지
// 여기서 명시적으로 고정해 둔다 — 화면과 Level 계산이 서로 다른 count 정의를 쓰지 않게 한다.
function createMockSupabase(script: MockResult[]) {
  const calls: RecordedCall[][] = []
  let cursor = 0

  function makeClient() {
    const from = vi.fn((_table: string) => {
      const record: RecordedCall[] = []
      calls.push(record)
      const result = script[cursor] ?? { data: null, count: null, error: new Error('unscripted call') }
      cursor++

      const chain: Record<string, (...args: unknown[]) => unknown> = {}
      for (const method of ['select', 'eq', 'order', 'range', 'ilike', 'not', 'is', 'limit']) {
        chain[method] = (...args: unknown[]) => {
          record.push({ method, args })
          return chain
        }
      }
      // count-only 호출(head:true)과 data+count 호출 모두 여기서 resolve됨(thenable 패턴)
      Object.assign(chain, {
        then: (resolve: (value: MockResult) => unknown) =>
          resolve({ data: result.data ?? null, count: result.count ?? null, error: result.error ?? null }),
      })
      return chain
    })
    return { from }
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

describe('getSchoolProfileCount — School Hub SEO 임계값과 Level Sync cumulativeXp가 공유하는 count 소스', () => {
  it('school_id + is_hidden=false로만 필터링하고 head:true count를 그대로 반환', async () => {
    const { supabase, supabaseServer, calls } = createMockSupabase([{ count: 7, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getSchoolProfileCount } = await import('./profiles')

    const result = await getSchoolProfileCount('school-1')

    expect(result).toBe(7)
    expect(calls.length).toBe(1)
    const eqCalls = calls[0].filter((c) => c.method === 'eq')
    expect(eqCalls).toEqual([
      { method: 'eq', args: ['school_id', 'school-1'] },
      { method: 'eq', args: ['is_hidden', false] },
    ])
    const selectCall = findCall(calls[0], 'select')
    expect(selectCall?.args).toEqual(['*', { count: 'exact', head: true }])
  })

  it('count가 null이거나 오류면 0을 반환 (음수/undefined로 새지 않음)', async () => {
    const { supabase, supabaseServer } = createMockSupabase([{ count: null, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getSchoolProfileCount } = await import('./profiles')

    expect(await getSchoolProfileCount('school-1')).toBe(0)
  })

  it('DB 오류 시 0을 반환하고 예외를 던지지 않음', async () => {
    const { supabase, supabaseServer } = createMockSupabase([
      { count: null, error: { message: 'network error' } },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getSchoolProfileCount } = await import('./profiles')

    await expect(getSchoolProfileCount('school-1')).resolves.toBe(0)
  })
})

describe('getYearProfileCount / getClassProfileCount — Year/Class 페이지 헤더 인원 수', () => {
  it('getYearProfileCount는 school_id + graduation_year + is_hidden=false로 필터링', async () => {
    const { supabase, supabaseServer, calls } = createMockSupabase([{ count: 3, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getYearProfileCount } = await import('./profiles')

    const result = await getYearProfileCount('school-1', 2015)

    expect(result).toBe(3)
    const eqCalls = calls[0].filter((c) => c.method === 'eq')
    expect(eqCalls).toEqual([
      { method: 'eq', args: ['school_id', 'school-1'] },
      { method: 'eq', args: ['graduation_year', 2015] },
      { method: 'eq', args: ['is_hidden', false] },
    ])
  })

  it('getClassProfileCount는 school_id + graduation_year + grade + class_number + is_hidden=false로 필터링', async () => {
    const { supabase, supabaseServer, calls } = createMockSupabase([{ count: 1, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getClassProfileCount } = await import('./profiles')

    const result = await getClassProfileCount('school-1', 2015, 3, 2)

    expect(result).toBe(1)
    const eqCalls = calls[0].filter((c) => c.method === 'eq')
    expect(eqCalls).toEqual([
      { method: 'eq', args: ['school_id', 'school-1'] },
      { method: 'eq', args: ['graduation_year', 2015] },
      { method: 'eq', args: ['grade', 3] },
      { method: 'eq', args: ['class_number', 2] },
      { method: 'eq', args: ['is_hidden', false] },
    ])
  })
})

describe('getProfilesBySchool — School Hub 상단 "N명 등록" 헤더의 실제 데이터 소스', () => {
  it('연도 필터 없이 호출하면 학교 전체(is_hidden=false)의 exact count를 반환', async () => {
    const rows = [{ id: 'p1' }, { id: 'p2' }]
    const { supabase, supabaseServer, calls } = createMockSupabase([
      { data: rows, count: 5, error: null },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getProfilesBySchool } = await import('./profiles')

    const result = await getProfilesBySchool('school-1', 1)

    expect(result).toEqual({ data: rows, count: 5 })
    const eqCalls = calls[0].filter((c) => c.method === 'eq')
    expect(eqCalls).toEqual([
      { method: 'eq', args: ['school_id', 'school-1'] },
      { method: 'eq', args: ['is_hidden', false] },
    ])
    // year 파라미터를 주지 않으면 graduation_year eq가 추가되지 않아야 함 (학교 총원 표시와 연도별 표시가 섞이지 않도록)
    expect(eqCalls.some((c) => c.args[0] === 'graduation_year')).toBe(false)
  })

  it('year 필터를 주면 graduation_year eq가 추가되어 그 연도만의 count를 반환 (학교 총원과 다른 값일 수 있음을 명시)', async () => {
    const { supabase, supabaseServer, calls } = createMockSupabase([
      { data: [], count: 2, error: null },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getProfilesBySchool } = await import('./profiles')

    const result = await getProfilesBySchool('school-1', 1, 2015)

    expect(result.count).toBe(2)
    const eqCalls = calls[0].filter((c) => c.method === 'eq')
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['graduation_year', 2015] })
  })

  it('오류 시 count 0 + 빈 배열을 반환 (실제 DB 상태를 잘못된 값으로 덮어쓰지 않음)', async () => {
    const { supabase, supabaseServer } = createMockSupabase([
      { data: null, count: null, error: { message: 'db down' } },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getProfilesBySchool } = await import('./profiles')

    const result = await getProfilesBySchool('school-1', 1)

    expect(result).toEqual({ data: [], count: 0 })
  })
})
