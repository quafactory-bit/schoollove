import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/user-auth', () => ({ getAuthenticatedRequestContext: mocks.auth }))

import { PATCH } from './route'

const userId = '00000000-0000-4000-8000-000000000001'
const request = (body: unknown) => new Request('http://localhost/api/account/instagram', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('owner Connected Instagram handle route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    mocks.auth.mockResolvedValue({ user: { id: userId }, client: { rpc: mocks.rpc } })
  })

  it('authenticates before parsing or calling the RPC', async () => {
    mocks.auth.mockResolvedValue(null)
    const response = await PATCH(request({ instagram_handle: 'owner.test' }) as never)
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('accepts only the strict single-field handle contract', async () => {
    for (const body of [
      { instagram_handle: '@invalid' },
      { instagram_handle: 'valid', owner_user_id: userId },
      {},
    ]) {
      const response = await PATCH(request(body) as never)
      expect(response.status).toBe(400)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('passes only the handle to the owner-safe RPC and returns no handle', async () => {
    const response = await PATCH(request({ instagram_handle: 'Owner.Test' }) as never)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('update_own_connected_instagram_handle', {
      requested_instagram_handle: 'Owner.Test',
    })
    expect(await response.json()).toEqual({ updated: true })
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  })

  it('allows a null privacy cleanup request', async () => {
    const response = await PATCH(request({ instagram_handle: null }) as never)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('update_own_connected_instagram_handle', {
      requested_instagram_handle: null,
    })
  })

  it('maps expected policy errors without reflecting database details', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'CONNECTED_INSTAGRAM_ACCESS_REQUIRED: private detail' } })
    const forbidden = await PATCH(request({ instagram_handle: 'owner.test' }) as never)
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({ error: '현재 Instagram 설정 권한이 없습니다.' })

    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'sensitive unexpected detail' } })
    const unexpected = await PATCH(request({ instagram_handle: 'owner.test' }) as never)
    expect(unexpected.status).toBe(500)
    expect(await unexpected.json()).toEqual({ error: 'Instagram 아이디를 저장할 수 없습니다.' })
  })
})
