import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn(), writeAccess: vi.fn() }))
vi.mock('@/lib/user-auth', () => ({ getAuthenticatedRequestContext: mocks.auth }))
vi.mock('@/lib/onboarding', () => ({ syncOnboardingProgressSafely: vi.fn() }))
vi.mock('@/lib/publicAccountLaunch', () => ({
  hasAccountOnboardingWriteAccess: mocks.writeAccess,
  getSafeMembershipError: () => null,
}))
import { NextRequest } from 'next/server'
import { POST } from './route'

const userId = '00000000-0000-4000-8000-000000000001'
const schoolId = '00000000-0000-4000-8000-000000000002'
const call = (graduationYear: number) => POST(new NextRequest('http://localhost/api/account/memberships', {
  method: 'POST',
  body: JSON.stringify({ school_id: schoolId, graduation_year: graduationYear, grade_classes: [], show_in_school_roster: true }),
}))

function tableRow(row: unknown) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve({ data: row, error: null }) }
  return chain
}

describe('v2-02 memberships API — 재학 중 졸업연도 거부', () => {
  let schoolType: string | null = 'high'

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T03:00:00.000Z'))
    schoolType = 'high'
    mocks.writeAccess.mockResolvedValue(true)
    mocks.from.mockImplementation((table: string) => tableRow(
      table === 'schools' ? (schoolType ? { school_type: schoolType } : null) : { id: 'profile' },
    ))
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === 'has_current_adult_access' ? true : { id: 'membership' }, error: null,
    }))
    mocks.auth.mockResolvedValue({
      user: { id: userId },
      client: { rpc: mocks.rpc, from: mocks.from },
    })
  })

  afterEach(() => { vi.useRealTimers() })

  it('고등학교 올해 졸업연도(재학 중)는 400으로 거부하고 저장 RPC를 부르지 않는다', async () => {
    const response = await call(2026)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '재학 중인 학교는 등록할 수 없어요.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([['middle', 2023], ['elementary', 2020]])('%s %i년 졸업은 거부한다', async (type, year) => {
    schoolType = type
    expect((await call(year)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('1950년보다 이른 졸업연도는 거부한다', async () => {
    expect((await call(1949)).status).toBe(400)
  })

  it('학교를 찾을 수 없으면 400', async () => {
    schoolType = null
    expect((await call(2010)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('허용 범위의 마지막 연도는 저장한다', async () => {
    const response = await call(2025)
    expect(response.status).toBe(201)
    expect(mocks.rpc).toHaveBeenCalledWith('add_own_school_membership_with_roster', expect.objectContaining({
      requested_school_id: schoolId, requested_graduation_year: 2025,
    }))
  })
})
