import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), deleteUser: vi.fn(), authorized: vi.fn() }))
vi.mock('@/lib/api/requireAdmin', () => ({ requireAdminSession: mocks.authorized }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc, auth: { admin: { deleteUser: mocks.deleteUser } } }) }))
vi.mock('@/lib/publicAccountLaunch', () => ({ getPublicAccountAdminState: vi.fn() }))
import { PATCH } from './route'

const request = () => new NextRequest('https://example.invalid/api/admin/public-account', {
  method: 'PATCH', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'complete_deletion', requestId: 'c1000000-0000-4000-8000-000000000001', reason: 'USER_REQUEST' }),
})
describe('verified deletion retry boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorized.mockResolvedValue(true)
    mocks.deleteUser.mockResolvedValue({ error: null })
    mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data:
      name === 'admin_prepare_public_account_deletion' ? { public_data_deleted: true } :
      name === 'admin_begin_public_account_auth_deletion' ? { user_id: 'a1000000-0000-4000-8000-000000000001' } : true,
    }))
  })
  it('rejects non-admin requests before any deletion work', async () => {
    mocks.authorized.mockResolvedValue(false)
    expect((await PATCH(request())).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('completes in prepare, begin, Auth deletion, finalize order', async () => {
    expect((await PATCH(request())).status).toBe(200)
    expect(mocks.deleteUser).toHaveBeenCalledWith('a1000000-0000-4000-8000-000000000001', false)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      'admin_prepare_public_account_deletion', 'admin_begin_public_account_auth_deletion', 'admin_finalize_public_account_auth_deletion',
    ])
    expect(mocks.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[2])
  })
  it('resumes finalization after Auth was deleted but the previous response was lost', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { public_data_deleted: true }, error: null })
      .mockResolvedValueOnce({ data: { user_id: null }, error: null })
    expect((await PATCH(request())).status).toBe(200)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenLastCalledWith('admin_finalize_public_account_auth_deletion', expect.any(Object))
  })
  it('does not interpret a missing user_id as verified Auth deletion', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { public_data_deleted: true }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null })
    expect((await PATCH(request())).status).toBe(409)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })
  it('leaves a failed Auth deletion retryable, without finalizing', async () => {
    mocks.deleteUser.mockResolvedValue({ error: { message: 'unavailable' } })
    expect((await PATCH(request())).status).toBe(503)
    expect(mocks.rpc).toHaveBeenLastCalledWith('admin_mark_public_account_auth_deletion_failed', expect.any(Object))
  })
  it('returns success on a completed request without deleting a second time', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { public_data_deleted: true, already_done: true }, error: null })
    expect((await PATCH(request())).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })
  it('reports a rejected finalization instead of claiming completion', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { public_data_deleted: true }, error: null })
      .mockResolvedValueOnce({ data: { user_id: null }, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
    expect((await PATCH(request())).status).toBe(409)
  })
})
