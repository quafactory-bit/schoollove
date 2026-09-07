import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), access: vi.fn() }))
vi.mock('@/lib/user-auth', () => ({ getAuthenticatedRequestContext: mocks.auth }))
vi.mock('@/lib/publicAccountLaunch', () => ({ hasAccountOnboardingWriteAccess: mocks.access }))
import { PATCH } from './route'

const id = '00000000-0000-4000-8000-000000000001'
const rows = [{ grade_number: 1, class_number: 2 }]
const call = (body: unknown, membershipId = id) => PATCH(new Request('http://localhost/api/account/memberships/test/class-history', {
  method: 'PATCH', body: JSON.stringify(body),
}) as never, { params: Promise.resolve({ id: membershipId }) })

describe('class history owner replace API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ user: { id }, client: { rpc: mocks.rpc } })
    mocks.access.mockResolvedValue(true)
    mocks.rpc.mockImplementation((name: string, args: { requested_grade_classes?: unknown }) => Promise.resolve({
      data: name === 'has_current_adult_access' ? true : args.requested_grade_classes, error: null,
    }))
  })
  it('requires authentication before input parsing', async () => {
    mocks.auth.mockResolvedValue(null)
    expect((await call(null)).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([{}, { grade_classes: rows, owner_user_id: id }, { grade_classes: null },
    { grade_classes: [...rows, ...rows] }, { grade_classes: [{ ...rows[0], extra: 1 }] },
    { grade_classes: [{ grade_number: 0, class_number: 1 }] },
    { grade_classes: [{ grade_number: 1, class_number: 101 }] },
    { grade_classes: [{ grade_number: 1, class_number: 1.2 }] },
  ])('rejects malformed or authority-bearing payloads', async body => {
    expect((await call(body)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects a non-UUID membership id', async () => {
    expect((await call({ grade_classes: rows }, 'bad')).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([{ history: rows }, { history: [] }])('returns only normalized history and supports clearing', async ({ history }) => {
    const response = await call({ grade_classes: history })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ classHistory: history })
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(mocks.rpc).toHaveBeenCalledWith('replace_own_school_class_history', {
      target_membership_id: id, requested_grade_classes: history,
    })
  })
  it('fails closed before mutation on write/deletion and adult gates', async () => {
    mocks.access.mockResolvedValue(false)
    expect((await call({ grade_classes: rows })).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.access.mockResolvedValue(true)
    mocks.rpc.mockResolvedValue({ data: true, error: { message: 'lookup failed' } })
    expect((await call({ grade_classes: rows })).status).toBe(403)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('coarsens missing/non-owner/policy and runtime errors without data leakage', async () => {
    for (const [message, status] of [['CLASS_HISTORY_UNAVAILABLE', 403], ['private SQL detail', 500]] as const) {
      mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'has_current_adult_access'
        ? { data: true, error: null } : { data: null, error: { message } }))
      const response = await call({ grade_classes: rows })
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ error: '학년·반 정보를 저장할 수 없습니다.' })
    }
  })
  it('does not reflect malformed RPC data or extra fields', async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'has_current_adult_access'
      ? true : [{ ...rows[0], owner_user_id: id }], error: null }))
    expect((await call({ grade_classes: rows })).status).toBe(500)
  })
})
