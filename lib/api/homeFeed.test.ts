import { afterEach, describe, expect, it, vi } from 'vitest'

type MockResult = { data?: unknown; error?: unknown }
type RecordedCall = { method: string; args: unknown[] }

// lib/api/profiles.test.ts / lib/api/schools.test.ts와 동일한 패턴.
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
      for (const method of ['select', 'eq', 'order', 'limit']) {
        chain[method] = (...args: unknown[]) => {
          record.push({ method, args })
          return chain
        }
      }
      Object.assign(chain, {
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

describe('getRecentRegisterActivity — 최근 공개 프로필 등록 활동', () => {
  it('is_hidden=false로 필터링하고 limit만큼 제한 조회한다', async () => {
    const rows = [
      {
        id: 'p1',
        created_at: '2026-07-17T00:00:00.000Z',
        graduation_year: 2020,
        school: { school_name: 'A고등학교', slug: 'a-high', current_level: 2 },
      },
    ]
    const { supabase, supabaseServer, calls } = createMockSupabase([{ data: rows, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getRecentRegisterActivity } = await import('./homeFeed')

    const result = await getRecentRegisterActivity(12)

    expect(result).toEqual([
      { id: 'p1', createdAt: '2026-07-17T00:00:00.000Z', graduationYear: 2020, school: { schoolName: 'A고등학교', slug: 'a-high', currentLevel: 2 } },
    ])
    const eqCall = findCall(calls[0], 'eq')
    expect(eqCall?.args).toEqual(['is_hidden', false])
    const limitCall = findCall(calls[0], 'limit')
    expect(limitCall?.args).toEqual([12])
  })

  it('school join이 없는 행은 school: null로 매핑된다', async () => {
    const rows = [{ id: 'p1', created_at: '2026-07-17T00:00:00.000Z', graduation_year: null, school: null }]
    const { supabase, supabaseServer } = createMockSupabase([{ data: rows, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getRecentRegisterActivity } = await import('./homeFeed')

    const result = await getRecentRegisterActivity()

    expect(result[0].school).toBeNull()
  })

  it('8. 조회 오류 시 예외를 던지지 않고 빈 배열을 반환한다', async () => {
    const { supabase, supabaseServer } = createMockSupabase([{ data: null, error: { message: 'db error' } }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getRecentRegisterActivity } = await import('./homeFeed')

    await expect(getRecentRegisterActivity()).resolves.toEqual([])
  })

  it('nickname/instagram_id 필드를 select하지 않는다', async () => {
    const { supabase, supabaseServer, calls } = createMockSupabase([{ data: [], error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getRecentRegisterActivity } = await import('./homeFeed')

    await getRecentRegisterActivity()

    const selectCall = findCall(calls[0], 'select')
    const selectArg = String(selectCall?.args[0])
    expect(selectArg).not.toMatch(/nickname/)
    expect(selectArg).not.toMatch(/instagram/)
  })
})

describe('getRecentTraceActivity — 최근 공개 흔적 활동', () => {
  it('is_hidden=false로 필터링하고 message/school을 매핑한다', async () => {
    const rows = [
      {
        id: 't1',
        created_at: '2026-07-17T00:00:00.000Z',
        message: '나 여기 있어',
        school: { school_name: 'B고등학교', slug: 'b-high', current_level: null },
      },
    ]
    const { supabase, supabaseServer, calls } = createMockSupabase([{ data: rows, error: null }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getRecentTraceActivity } = await import('./homeFeed')

    const result = await getRecentTraceActivity()

    expect(result).toEqual([
      {
        id: 't1',
        createdAt: '2026-07-17T00:00:00.000Z',
        message: '나 여기 있어',
        school: { schoolName: 'B고등학교', slug: 'b-high', currentLevel: null },
      },
    ])
    const eqCall = findCall(calls[0], 'eq')
    expect(eqCall?.args).toEqual(['is_hidden', false])
  })

  it('조회 오류 시 예외를 던지지 않고 빈 배열을 반환한다', async () => {
    const { supabase, supabaseServer } = createMockSupabase([{ data: null, error: { message: 'db error' } }])
    vi.doMock('@/lib/supabase', () => ({ supabase, supabaseServer }))
    const { getRecentTraceActivity } = await import('./homeFeed')

    await expect(getRecentTraceActivity()).resolves.toEqual([])
  })
})
