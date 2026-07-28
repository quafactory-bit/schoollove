import { afterEach, describe, expect, it, vi } from 'vitest'

// PHASE 7A ADMIN MUTATION AUTHORITY PATCH — 이 모듈의 관리자 mutation/전용 조회 함수는
// service-role 클라이언트(getSupabaseAdmin())를 사용해야 하고, anon 키(supabaseServer)로는
// 절대 관리자 UPDATE/DELETE나 reports SELECT를 시도하지 않아야 한다(원격 권한 조회로
// anon/authenticated가 그 권한 자체를 갖고 있지 않음을 확인했음). 두 클라이언트를
// 서로 다른 mock으로 분리해 어느 쪽이 실제로 호출됐는지 직접 검증한다.

type MockResult = { data: unknown; error: unknown; count?: number | null }
type RecordedCall = { method: string; args: unknown[] }

function createChainableFrom(script: MockResult[]) {
  const calls: RecordedCall[][] = []
  let cursor = 0

  const from = vi.fn((_table: string) => {
    const record: RecordedCall[] = []
    calls.push(record)
    const result = script[cursor] ?? { data: null, error: new Error('unscripted call') }
    cursor++

    const chain: any = {}
    for (const method of ['select', 'eq', 'gte', 'update', 'delete', 'order', 'range', 'or', 'limit', 'ilike', 'in']) {
      chain[method] = (...args: unknown[]) => {
        record.push({ method, args })
        return chain
      }
    }
    chain.single = () => Promise.resolve(result)
    chain.then = (resolve: (value: MockResult) => unknown) => resolve(result)
    return chain
  })

  return { from, calls }
}

function findCall(record: RecordedCall[], method: string): RecordedCall | undefined {
  return record.find((c) => c.method === method)
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

const REPORT_ID = 'report-1'
const PROFILE_ID = 'profile-1'

// supabaseServer(anon)는 호출되면 즉시 알아챌 수 있도록 항상 permission-denied류 오류를
// 반환하는 스텁으로 둔다 — 실제 원격 상태(anon은 이 테이블들에 권한이 없음)를 그대로
// 재현한 것이며, 관리자 함수가 실수로 이 client를 쓰면 테스트가 실패하도록 만든다.
function anonDeniedClient() {
  const from = vi.fn(() => {
    const chain: any = {}
    for (const method of ['select', 'eq', 'update', 'delete', 'order', 'range', 'or', 'limit', 'ilike', 'in']) {
      chain[method] = () => chain
    }
    chain.single = () => Promise.resolve({ data: null, error: { message: 'permission denied' } })
    chain.then = (resolve: (v: MockResult) => unknown) =>
      resolve({ data: null, error: { message: 'permission denied' }, count: null })
    return chain
  })
  return { from }
}

describe('markRequestAsDone / markRequestAsPending — admin client 사용', () => {
  it('1. markRequestAsDone은 admin client로 reports.status를 done으로 UPDATE한다', async () => {
    const { from: adminFrom, calls } = createChainableFrom([{ data: null, error: null }])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { markRequestAsDone } = await import('./admin')

    const result = await markRequestAsDone(REPORT_ID)

    expect(result).toBe(true)
    expect(getSupabaseAdmin).toHaveBeenCalled()
    expect(adminFrom).toHaveBeenCalledWith('reports')
    const updateCall = findCall(calls[0], 'update')
    expect(updateCall?.args).toEqual([{ status: 'done' }])
  })

  it('2. markRequestAsPending은 admin client로 reports.status를 pending으로 UPDATE한다', async () => {
    const { from: adminFrom, calls } = createChainableFrom([{ data: null, error: null }])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { markRequestAsPending } = await import('./admin')

    const result = await markRequestAsPending(REPORT_ID)

    expect(result).toBe(true)
    const updateCall = findCall(calls[0], 'update')
    expect(updateCall?.args).toEqual([{ status: 'pending' }])
  })

  it('3. getSupabaseAdmin()이 예외를 던지면(service role key 없음) false를 반환한다(예외를 던지지 않음)', async () => {
    const getSupabaseAdmin = vi.fn(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
    })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { markRequestAsDone } = await import('./admin')

    await expect(markRequestAsDone(REPORT_ID)).resolves.toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('4. DB UPDATE 자체가 오류를 반환하면 false로 고정 처리한다', async () => {
    const { from: adminFrom } = createChainableFrom([{ data: null, error: { message: 'db error' } }])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { markRequestAsDone } = await import('./admin')

    await expect(markRequestAsDone(REPORT_ID)).resolves.toBe(false)
  })
})

describe('hideProfile / unhideProfile — admin client 사용', () => {
  it('5. hideProfile은 admin client로 profiles.is_hidden을 true로 UPDATE한다', async () => {
    const { from: adminFrom, calls } = createChainableFrom([{ data: null, error: null }])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { hideProfile } = await import('./admin')

    const result = await hideProfile(PROFILE_ID)

    expect(result).toBe(true)
    expect(adminFrom).toHaveBeenCalledWith('profiles')
    const updateCall = findCall(calls[0], 'update')
    expect(updateCall?.args).toEqual([{ is_hidden: true }])
  })

  it('6. unhideProfile은 admin client로 profiles.is_hidden을 false로 UPDATE한다', async () => {
    const { from: adminFrom, calls } = createChainableFrom([{ data: null, error: null }])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { unhideProfile } = await import('./admin')

    const result = await unhideProfile(PROFILE_ID)

    expect(result).toBe(true)
    const updateCall = findCall(calls[0], 'update')
    expect(updateCall?.args).toEqual([{ is_hidden: false }])
  })

  it('7. anon supabaseServer는 hideProfile/unhideProfile에서 전혀 호출되지 않는다', async () => {
    const { from: adminFrom } = createChainableFrom([
      { data: null, error: null },
      { data: null, error: null },
    ])
    const anonClient = anonDeniedClient()
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonClient, getSupabaseAdmin }))
    const { hideProfile, unhideProfile } = await import('./admin')

    await hideProfile(PROFILE_ID)
    await unhideProfile(PROFILE_ID)

    expect(anonClient.from).not.toHaveBeenCalled()
  })
})

describe('getEditRequestDetail / applyProfileInstagramEdit — admin client 사용', () => {
  it('8. getEditRequestDetail은 admin client로 reports를 조회한다(anon은 reports SELECT 권한이 없음)', async () => {
    const { from: adminFrom, calls } = createChainableFrom([
      { data: { profile_id: PROFILE_ID, requested_instagram_id: 'new_id' }, error: null },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { getEditRequestDetail } = await import('./admin')

    const result = await getEditRequestDetail(REPORT_ID)

    expect(result).toEqual({ profileId: PROFILE_ID, requestedInstagramId: 'new_id' })
    expect(adminFrom).toHaveBeenCalledWith('reports')
    const eqCalls = calls[0].filter((c) => c.method === 'eq')
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['id', REPORT_ID] })
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['type', 'edit'] })
  })

  it('9. requested_instagram_id가 null이면 null을 반환한다(방어적 처리)', async () => {
    const { from: adminFrom } = createChainableFrom([
      { data: { profile_id: PROFILE_ID, requested_instagram_id: null }, error: null },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { getEditRequestDetail } = await import('./admin')

    await expect(getEditRequestDetail(REPORT_ID)).resolves.toBeNull()
  })

  it('10. applyProfileInstagramEdit은 admin client로 profiles.instagram_id만 UPDATE한다', async () => {
    const { from: adminFrom, calls } = createChainableFrom([{ data: null, error: null }])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { applyProfileInstagramEdit } = await import('./admin')

    const result = await applyProfileInstagramEdit(PROFILE_ID, 'new_id')

    expect(result).toBe(true)
    const updateCall = findCall(calls[0], 'update')
    expect(updateCall?.args).toEqual([{ instagram_id: 'new_id' }])
  })

  it('11. DB 오류 시 false를 반환한다(예외를 던지지 않음)', async () => {
    const { from: adminFrom } = createChainableFrom([{ data: null, error: { message: 'db error' } }])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { applyProfileInstagramEdit } = await import('./admin')

    await expect(applyProfileInstagramEdit(PROFILE_ID, 'new_id')).resolves.toBe(false)
  })
})

describe('deleteProfileCompletely — admin client 사용', () => {
  it('12. reports → profiles 순서로 admin client를 통해 DELETE한다', async () => {
    const { from: adminFrom, calls } = createChainableFrom([
      { data: null, error: null },
      { data: null, error: null },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { deleteProfileCompletely } = await import('./admin')

    const result = await deleteProfileCompletely(PROFILE_ID)

    expect(result).toBe(true)
    expect(adminFrom).toHaveBeenNthCalledWith(1, 'reports')
    expect(adminFrom).toHaveBeenNthCalledWith(2, 'profiles')
    expect(findCall(calls[0], 'delete')).toBeTruthy()
    expect(findCall(calls[1], 'delete')).toBeTruthy()
  })

  it('13. getSupabaseAdmin() 예외 시 false를 반환한다(예외를 던지지 않음)', async () => {
    const getSupabaseAdmin = vi.fn(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
    })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deleteProfileCompletely } = await import('./admin')

    await expect(deleteProfileCompletely(PROFILE_ID)).resolves.toBe(false)
    consoleErrorSpy.mockRestore()
  })
})

describe('getRecentRequests — admin client 사용(anon은 reports SELECT 권한이 없음)', () => {
  it('14. admin client로 reports를 조회하고 profile을 join한다', async () => {
    const { from: adminFrom } = createChainableFrom([
      {
        data: [
          {
            id: REPORT_ID,
            type: 'report',
            reason: '기타',
            status: 'pending',
            created_at: '2026-01-01T00:00:00.000Z',
            requested_instagram_id: null,
            is_self_claimed: false,
            profile: null,
          },
        ],
        error: null,
      },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    const anonClient = anonDeniedClient()
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonClient, getSupabaseAdmin }))
    const { getRecentRequests } = await import('./admin')

    const result = await getRecentRequests('report', 20)

    expect(result).toHaveLength(1)
    expect(adminFrom).toHaveBeenCalledWith('reports')
    expect(anonClient.from).not.toHaveBeenCalled()
  })

  it('15. admin client를 확보하지 못하면 빈 배열을 반환한다(예외를 던지지 않음)', async () => {
    const getSupabaseAdmin = vi.fn(() => {
      throw new Error('no service role')
    })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getRecentRequests } = await import('./admin')

    await expect(getRecentRequests('edit', 20)).resolves.toEqual([])
    consoleErrorSpy.mockRestore()
  })
})

describe('getDashboardStats — profiles는 anon, reports는 admin client로 분리', () => {
  it('16. profiles 집계 2건은 supabaseServer(anon)로, reports 집계 2건은 admin client로 조회한다', async () => {
    const anonFrom = vi.fn(() => {
      const chain: any = {}
      for (const method of ['select', 'eq', 'gte']) {
        chain[method] = () => chain
      }
      chain.then = (resolve: (v: MockResult) => unknown) => resolve({ data: null, error: null, count: 5 })
      return chain
    })
    const { from: adminFrom } = createChainableFrom([
      { data: null, error: null, count: 5 },
      { data: null, error: null, count: 4 },
      { data: null, error: null, count: 2 },
      { data: null, error: null, count: 1 },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: { from: anonFrom }, getSupabaseAdmin }))
    const { getDashboardStats } = await import('./admin')

    const stats = await getDashboardStats()

    expect(stats).toEqual({
      totalProfiles: 5,
      todayProfiles: 4,
      pendingReports: 2,
      pendingDeleteRequests: 1,
    })
    expect(anonFrom).not.toHaveBeenCalled()
    expect(adminFrom).toHaveBeenCalledWith('profiles')
    expect(adminFrom).toHaveBeenCalledWith('reports')
  })

  it('17. admin client를 확보하지 못해도 profiles 집계는 그대로 반환하고 reports 집계만 0으로 처리한다', async () => {
    const anonFrom = vi.fn(() => {
      const chain: any = {}
      for (const method of ['select', 'eq', 'gte']) {
        chain[method] = () => chain
      }
      chain.then = (resolve: (v: MockResult) => unknown) => resolve({ data: null, error: null, count: 3 })
      return chain
    })
    const getSupabaseAdmin = vi.fn(() => {
      throw new Error('no service role')
    })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: { from: anonFrom }, getSupabaseAdmin }))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getDashboardStats } = await import('./admin')

    const stats = await getDashboardStats()

    expect(stats.totalProfiles).toBe(0)
    expect(stats.todayProfiles).toBe(0)
    expect(stats.pendingReports).toBe(0)
    expect(stats.pendingDeleteRequests).toBe(0)
    expect(anonFrom).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})

describe('getAdminProfiles — admin client 사용(숨김 프로필도 조회 가능해야 함)', () => {
  it('18. admin client로 profiles를 조회한다(anon RLS의 is_hidden=false 제한을 받지 않기 위함)', async () => {
    const { from: adminFrom } = createChainableFrom([
      { data: [{ id: PROFILE_ID, nickname: '테스트', instagram_id: null, graduation_year: 2020, grade: null, class_number: null, department: null, report_count: 3, is_hidden: true, created_at: '2026-01-01T00:00:00.000Z', school: { id: 'school-1', school_name: '전체목록고등학교', slug: 'all-high', school_type: 'high' } }], error: null, count: 1 },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    const anonClient = anonDeniedClient()
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonClient, getSupabaseAdmin }))
    const { getAdminProfiles } = await import('./admin')

    const result = await getAdminProfiles(1, '', 20)

    expect(result.total).toBe(1)
    expect(result.error).toBe(false)
    expect(result.profiles[0].is_hidden).toBe(true)
    expect(result.profiles[0].school?.school_name).toBe('전체목록고등학교')
    expect(adminFrom).toHaveBeenCalledWith('profiles')
    expect(anonClient.from).not.toHaveBeenCalled()
  })

  it('19. 닉네임 부분 일치 검색은 관리자 서버에서 수행하고 created_at 내림차순 결과를 유지한다', async () => {
    const older = { id: 'profile-old', nickname: '운영검증', instagram_id: null, graduation_year: 2020, grade: null, class_number: null, department: null, report_count: 0, is_hidden: false, created_at: '2026-01-01T00:00:00.000Z', school: { id: 'school-1', school_name: '닉네임고등학교', slug: 'nickname-high', school_type: 'high' } }
    const newer = { ...older, id: 'profile-new', created_at: '2026-01-02T00:00:00.000Z' }
    const { from: adminFrom, calls } = createChainableFrom([
      { data: [], error: null },
      { data: [newer, older], error: null },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { getAdminProfiles } = await import('./admin')

    const result = await getAdminProfiles(1, '운영검증', 0)

    expect(result).toMatchObject({ total: 2, error: false })
    expect(result.profiles.map((profile) => profile.id)).toEqual(['profile-new', 'profile-old'])
    expect(result.profiles.every((profile) => profile.school?.school_name === '닉네임고등학교')).toBe(true)
    expect(adminFrom).toHaveBeenNthCalledWith(1, 'schools')
    expect(adminFrom).toHaveBeenNthCalledWith(2, 'profiles')
    expect(findCall(calls[0], 'ilike')?.args).toEqual(['school_name', '%운영검증%'])
    expect(findCall(calls[1], 'ilike')?.args).toEqual(['nickname', '%운영검증%'])
    expect(findCall(calls[1], 'order')?.args).toEqual(['created_at', { ascending: false }])
    expect(findCall(calls[1], 'or')).toBeUndefined()
  })

  it('20. 학교명 부분 일치 검색은 먼저 학교 ID를 찾은 뒤 해당 학교 profiles를 조회한다', async () => {
    const row = { id: PROFILE_ID, nickname: '테스트', instagram_id: null, graduation_year: 2020, grade: null, class_number: null, department: null, report_count: 0, is_hidden: true, created_at: '2026-01-01T00:00:00.000Z', school: { id: 'school-1', school_name: '한글고등학교', slug: 'hangul-high', school_type: 'high' } }
    const { from: adminFrom, calls } = createChainableFrom([
      { data: [{ id: 'school-1' }], error: null },
      { data: [], error: null },
      { data: [row], error: null },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { getAdminProfiles } = await import('./admin')

    const result = await getAdminProfiles(1, '한글고', 0)

    expect(result.profiles).toHaveLength(1)
    expect(result.profiles[0].school?.school_name).toBe('한글고등학교')
    expect(adminFrom).toHaveBeenNthCalledWith(3, 'profiles')
    expect(findCall(calls[2], 'in')?.args).toEqual(['school_id', ['school-1']])
    expect(findCall(calls[2], 'order')?.args).toEqual(['created_at', { ascending: false }])
  })

  it('21. 닉네임과 학교명에 모두 일치한 profile은 한 번만 반환한다', async () => {
    const row = { id: PROFILE_ID, nickname: '한글고', instagram_id: null, graduation_year: 2020, grade: null, class_number: null, department: null, report_count: 0, is_hidden: false, created_at: '2026-01-01T00:00:00.000Z', school: { id: 'school-1', school_name: '한글고등학교', slug: 'hangul-high', school_type: 'high' } }
    const { from: adminFrom } = createChainableFrom([
      { data: [{ id: 'school-1' }], error: null },
      { data: [row], error: null },
      { data: [row], error: null },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { getAdminProfiles } = await import('./admin')

    const result = await getAdminProfiles(1, '한글고', 0)

    expect(result).toMatchObject({ total: 1, error: false })
    expect(result.profiles).toHaveLength(1)
    expect(result.profiles[0].school?.school_name).toBe('한글고등학교')
  })

  it('22. %, _, 쉼표, 괄호와 따옴표가 포함된 검색어도 filter 문법을 조합하지 않고 안전하게 전달한다', async () => {
    const query = `한글%_,()'"`
    const { from: adminFrom, calls } = createChainableFrom([
      { data: [], error: null },
      { data: [], error: null },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const { getAdminProfiles } = await import('./admin')

    const result = await getAdminProfiles(1, `  ${query}  `, 0)

    expect(result).toMatchObject({ total: 0, error: false })
    expect(findCall(calls[0], 'ilike')?.args).toEqual(['school_name', `%한글\\%\\_,()'"%`])
    expect(findCall(calls[1], 'ilike')?.args).toEqual(['nickname', `%한글\\%\\_,()'"%`])
    expect(findCall(calls[0], 'or')).toBeUndefined()
    expect(findCall(calls[1], 'or')).toBeUndefined()
  })

  it('23. Supabase 검색 오류는 빈 결과가 아닌 error 상태로 반환한다', async () => {
    const { from: adminFrom } = createChainableFrom([
      { data: null, error: { message: 'PostgREST 400' } },
    ])
    const getSupabaseAdmin = vi.fn(() => ({ from: adminFrom }))
    vi.doMock('@/lib/supabase', () => ({ supabaseServer: anonDeniedClient(), getSupabaseAdmin }))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getAdminProfiles } = await import('./admin')

    const result = await getAdminProfiles(1, '운영검증', 0)

    expect(result).toEqual({ profiles: [], total: 0, error: true })
    consoleErrorSpy.mockRestore()
  })
})
