import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  state: vi.fn(),
  setPermission: vi.fn(),
}))

vi.mock('@/lib/api/connectionRoute', () => ({ requireConnectionContext: mocks.context }))
vi.mock('@/lib/connections', () => ({
  getConnectionInstagramState: mocks.state,
  setInstagramPermission: mocks.setPermission,
}))

import { DELETE, GET, POST } from './[id]/instagram/route'

const actorId = '00000000-0000-4000-8000-000000000001'
const connectionId = '00000000-0000-4000-8000-000000000002'
const request = new Request(`http://localhost/api/connections/${connectionId}/instagram`)
const routeContext = { params: Promise.resolve({ id: connectionId }) }

describe('connected Instagram selective-share route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.mockResolvedValue({ auth: { user: { id: actorId }, client: {} } })
    mocks.state.mockResolvedValue({
      instagramHandle: null,
      myInstagramConfigured: true,
      myInstagramVisible: false,
    })
    mocks.setPermission.mockResolvedValue(true)
  })

  it.each([GET, POST, DELETE])('stops at the feature gate before any state read', async (handler) => {
    mocks.context.mockResolvedValue({
      response: new Response('{"error":"LIMITED_BETA_ACCESS_REQUIRED"}', { status: 403 }),
    })
    const response = await handler(request as never, routeContext)
    expect(response?.status).toBe(403)
    expect(response!.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    expect(mocks.context).toHaveBeenCalledWith(request, 'instagram')
    expect(mocks.state).not.toHaveBeenCalled()
    expect(mocks.setPermission).not.toHaveBeenCalled()
  })

  it('returns only the three product state fields with private no-store caching', async () => {
    mocks.state.mockResolvedValue({
      instagramHandle: 'counterpart.handle',
      myInstagramConfigured: true,
      myInstagramVisible: false,
    })
    const response = await GET(request as never, routeContext)
    expect(response?.status).toBe(200)
    expect(await response!.json()).toEqual({
      instagramHandle: 'counterpart.handle',
      myInstagramConfigured: true,
      myInstagramVisible: false,
    })
    expect(response!.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
  })

  it.each(['nonparticipant', 'inactive', 'blocked'])(
    'contracts %s state to the same unavailable response',
    async () => {
      mocks.state.mockResolvedValue(null)
      const response = await GET(request as never, routeContext)
      expect(response?.status).toBe(404)
      expect(await response!.json()).toEqual({ error: '연결을 확인할 수 없습니다.' })
    },
  )

  it('does not create a grant when the actor has no configured handle', async () => {
    mocks.state.mockResolvedValue({
      instagramHandle: null,
      myInstagramConfigured: false,
      myInstagramVisible: false,
    })
    const response = await POST(request as never, routeContext)
    expect(response?.status).toBe(409)
    expect(await response!.json()).toEqual({ error: 'INSTAGRAM_HANDLE_REQUIRED' })
    expect(mocks.setPermission).not.toHaveBeenCalled()
  })

  it('creates only the actor-to-counterpart grant and returns the actor state', async () => {
    const response = await POST(request as never, routeContext)
    expect(response?.status).toBe(200)
    expect(await response!.json()).toEqual({ myInstagramVisible: true })
    expect(mocks.setPermission).toHaveBeenCalledWith(actorId, connectionId, true)
  })

  it('keeps repeated POST idempotent without another RPC notification', async () => {
    mocks.state.mockResolvedValue({
      instagramHandle: null,
      myInstagramConfigured: true,
      myInstagramVisible: true,
    })
    const response = await POST(request as never, routeContext)
    expect(response?.status).toBe(200)
    expect(mocks.setPermission).not.toHaveBeenCalled()
  })

  it('revokes only the actor-to-counterpart grant', async () => {
    mocks.state.mockResolvedValue({
      instagramHandle: 'counterpart.handle',
      myInstagramConfigured: true,
      myInstagramVisible: true,
    })
    const response = await DELETE(request as never, routeContext)
    expect(response?.status).toBe(200)
    expect(await response!.json()).toEqual({ myInstagramVisible: false })
    expect(mocks.setPermission).toHaveBeenCalledWith(actorId, connectionId, false)
  })

  it('keeps repeated DELETE idempotent without touching the counterpart grant', async () => {
    mocks.state.mockResolvedValue({
      instagramHandle: 'counterpart.handle',
      myInstagramConfigured: true,
      myInstagramVisible: false,
    })
    const response = await DELETE(request as never, routeContext)
    expect(response?.status).toBe(200)
    expect(await response!.json()).toEqual({ myInstagramVisible: false })
    expect(mocks.setPermission).not.toHaveBeenCalled()
  })

  it('does not expose mutation failure details', async () => {
    mocks.setPermission.mockResolvedValue(false)
    const response = await POST(request as never, routeContext)
    expect(response?.status).toBe(404)
    expect(await response!.json()).toEqual({ error: '연결을 확인할 수 없습니다.' })
  })
})
