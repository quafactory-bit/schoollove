import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSchoolLevelSnapshot, syncSchoolLevel } from './levels'
import type { SchoolLevelPersistenceRow } from '@/types/level'

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(),
}))

const SCHOOL_ID = 'school-1'
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z')
const FIXED_NOW_ISO = FIXED_NOW.toISOString()

function schoolLevelRow(
  currentLevel: number | null,
  levelUpdatedAt: string | null = null
): SchoolLevelPersistenceRow {
  return {
    id: SCHOOL_ID,
    current_level: currentLevel,
    level_updated_at: levelUpdatedAt,
  }
}

type MockResult = { data: unknown; error: unknown }
type RecordedCall = { method: string; args: unknown[] }

function createMockAdmin(script: MockResult[]) {
  const calls: RecordedCall[][] = []
  let cursor = 0

  const from = vi.fn((_table: string) => {
    const record: RecordedCall[] = []
    calls.push(record)
    const result = script[cursor] ?? { data: null, error: new Error('unscripted call') }
    cursor++

    const chain: any = {}
    for (const method of ['select', 'eq', 'is', 'lt', 'update']) {
      chain[method] = (...args: unknown[]) => {
        record.push({ method, args })
        return chain
      }
    }
    chain.single = () => Promise.resolve(result)
    chain.then = (resolve: (value: MockResult) => unknown) => resolve(result)
    return chain
  })

  return { admin: { from }, calls }
}

function findCall(record: RecordedCall[], method: string): RecordedCall | undefined {
  return record.find((c) => c.method === method)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('syncSchoolLevel', () => {
  it('1. stored Lv1, cumulativeXp=0(target Lv1) → UPDATE 없이 stored row 반환', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(1), error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 0)

    expect(result).toEqual(schoolLevelRow(1))
    expect(calls.length).toBe(1)
  })

  it('2. stored Lv2, cumulativeXp=0(target Lv1) → UPDATE 없이 Lv2 유지', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(2), error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 0)

    expect(result).toEqual(schoolLevelRow(2))
    expect(calls.length).toBe(1)
  })

  it('3. stored null, cumulativeXp=0(target Lv1) → init UPDATE, IS NULL 조건, level_updated_at 없음', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(null), error: null },
      { data: [schoolLevelRow(1)], error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 0)

    expect(result).toEqual(schoolLevelRow(1))
    expect(calls.length).toBe(2)

    const isCall = findCall(calls[1], 'is')
    expect(isCall?.args).toEqual(['current_level', null])

    const updateCall = findCall(calls[1], 'update')
    expect(updateCall?.args[0]).toEqual({ current_level: 1 })
  })

  it('4. stored Lv2, cumulativeXp=260(target Lv3) → increase UPDATE, current_level < 3, level_updated_at 포함', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(2), error: null },
      { data: [schoolLevelRow(3, FIXED_NOW_ISO)], error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 260)

    expect(result).toEqual(schoolLevelRow(3, FIXED_NOW_ISO))
    expect(calls.length).toBe(2)

    const ltCall = findCall(calls[1], 'lt')
    expect(ltCall?.args).toEqual(['current_level', 3])

    const updateCall = findCall(calls[1], 'update')
    expect(updateCall?.args[0]).toEqual({
      current_level: 3,
      level_updated_at: FIXED_NOW_ISO,
    })
  })

  it('5. increase UPDATE 0건 → refetch가 이미 target 이상 → 추가 UPDATE 없이 refetch row 반환', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(2), error: null },
      { data: [], error: null },
      { data: schoolLevelRow(3), error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 260)

    expect(result).toEqual(schoolLevelRow(3))
    expect(calls.length).toBe(3)
  })

  it('6. null 초기화 경쟁: init UPDATE 0건 → refetch Lv1 → 재판단 → increase 전환 → 최종 Lv4', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(null), error: null },
      { data: [], error: null },
      { data: schoolLevelRow(1), error: null },
      { data: [schoolLevelRow(4, FIXED_NOW_ISO)], error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 400)

    expect(result).toEqual(schoolLevelRow(4, FIXED_NOW_ISO))
    expect(calls.length).toBe(4)

    const firstAttemptIsCall = findCall(calls[1], 'is')
    expect(firstAttemptIsCall?.args).toEqual(['current_level', null])

    const secondAttemptLtCall = findCall(calls[3], 'lt')
    expect(secondAttemptLtCall?.args).toEqual(['current_level', 4])

    const secondAttemptUpdateCall = findCall(calls[3], 'update')
    expect(secondAttemptUpdateCall?.args[0]).toEqual({
      current_level: 4,
      level_updated_at: FIXED_NOW_ISO,
    })
  })

  it('7. 낮은 target이 높은 저장 Level을 덮어쓰지 않음: refetch Lv4 → 추가 UPDATE 없음', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(2), error: null },
      { data: [], error: null },
      { data: schoolLevelRow(4), error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 260)

    expect(result).toEqual(schoolLevelRow(4))
    expect(calls.length).toBe(3)
  })

  it('8. read error → null', async () => {
    const { admin, calls } = createMockAdmin([
      { data: null, error: { message: 'read failed' } },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 0)

    expect(result).toBeNull()
    expect(calls.length).toBe(1)
  })

  it('9. init update error → null', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(null), error: null },
      { data: null, error: { message: 'init update failed' } },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 0)

    expect(result).toBeNull()
    expect(calls.length).toBe(2)
  })

  it('10. increase update error → null', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(2), error: null },
      { data: null, error: { message: 'increase update failed' } },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 260)

    expect(result).toBeNull()
    expect(calls.length).toBe(2)
  })

  it('11. refetch error → null', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(2), error: null },
      { data: [], error: null },
      { data: null, error: { message: 'refetch failed' } },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 260)

    expect(result).toBeNull()
    expect(calls.length).toBe(3)
  })

  it('12. conflict가 MAX_RETRIES(5)까지 반복되면 → null', async () => {
    const conflictThenRefetch: MockResult[] = [
      { data: [], error: null },
      { data: schoolLevelRow(2), error: null },
    ]
    const script: MockResult[] = [
      { data: schoolLevelRow(2), error: null },
      ...conflictThenRefetch,
      ...conflictThenRefetch,
      ...conflictThenRefetch,
      ...conflictThenRefetch,
      ...conflictThenRefetch,
    ]
    const { admin, calls } = createMockAdmin(script)
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await syncSchoolLevel(SCHOOL_ID, 260)

    expect(result).toBeNull()
    expect(calls.length).toBe(11)
  })
})

describe('getSchoolLevelSnapshot', () => {
  it('1. row 존재 → SchoolLevelPersistenceRow 그대로 반환, projection 정확히 확인', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(2, FIXED_NOW_ISO), error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await getSchoolLevelSnapshot(SCHOOL_ID)

    expect(result).toEqual(schoolLevelRow(2, FIXED_NOW_ISO))
    expect(calls.length).toBe(1)

    const selectCall = findCall(calls[0], 'select')
    expect(selectCall?.args).toEqual(['id, current_level, level_updated_at'])

    const eqCall = findCall(calls[0], 'eq')
    expect(eqCall?.args).toEqual(['id', SCHOOL_ID])
  })

  it('2. row 없음(Supabase error) → null', async () => {
    const { admin, calls } = createMockAdmin([
      { data: null, error: { message: 'no rows' } },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await getSchoolLevelSnapshot(SCHOOL_ID)

    expect(result).toBeNull()
    expect(calls.length).toBe(1)
  })

  it('3. 조회 오류 → null', async () => {
    const { admin, calls } = createMockAdmin([
      { data: null, error: { message: 'network error' } },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await getSchoolLevelSnapshot(SCHOOL_ID)

    expect(result).toBeNull()
    expect(calls.length).toBe(1)
  })

  it('4. current_level: null, level_updated_at: null row → 정상 row 그대로 반환', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(null, null), error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    const result = await getSchoolLevelSnapshot(SCHOOL_ID)

    expect(result).toEqual(schoolLevelRow(null, null))
    expect(calls.length).toBe(1)
  })

  it('5. 읽기 전용 보장 — UPDATE 계열 호출이 발생하지 않는다', async () => {
    const { admin, calls } = createMockAdmin([
      { data: schoolLevelRow(3), error: null },
    ])
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>)

    await getSchoolLevelSnapshot(SCHOOL_ID)

    const updateCall = findCall(calls[0], 'update')
    expect(updateCall).toBeUndefined()
  })
})
