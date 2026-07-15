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
