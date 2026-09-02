import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  readJson: vi.fn(),
  beta: vi.fn(),
  detail: vi.fn(),
  conversation: vi.fn(),
  sendMessage: vi.fn(),
  markRead: vi.fn(),
  setInstagram: vi.fn(),
  disconnect: vi.fn(),
  block: vi.fn(),
}))

vi.mock('@/lib/api/connectionRoute', () => ({
  requireConnectionContext: mocks.context,
  readJson: mocks.readJson,
}))
vi.mock('@/lib/beta', () => ({ hasBetaFeatureAccess: mocks.beta }))
vi.mock('@/lib/connections', () => ({
  getConnectionDetail: mocks.detail,
  getConversation: mocks.conversation,
  sendConnectionMessage: mocks.sendMessage,
  markConversationRead: mocks.markRead,
  setInstagramPermission: mocks.setInstagram,
  disconnectConnection: mocks.disconnect,
  blockConnectionUser: mocks.block,
}))

import { GET as getDetail } from './[id]/route'
import { GET as getMessages, PATCH as patchMessages, POST as postMessage } from './[id]/messages/route'
import { DELETE as deleteInstagram, GET as getInstagram, POST as postInstagram } from './[id]/instagram/route'

const actorId = '00000000-0000-4000-8000-000000000001'
const connectionId = '00000000-0000-4000-8000-000000000002'
const auth = { user: { id: actorId }, client: {} }
const request = new Request(`http://localhost/api/connections/${connectionId}`)
const routeContext = { params: Promise.resolve({ id: connectionId }) }

describe('connection detail capability split', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.mockResolvedValue({ auth })
    mocks.detail.mockResolvedValue({ id: connectionId, status: 'active', displayName: '연결된 사용자' })
    mocks.beta.mockImplementation(async (_client, _userId, feature) => feature === 'people_search')
    mocks.conversation.mockResolvedValue({
      id: connectionId,
      status: 'active',
      displayName: '연결된 사용자',
      instagramHandle: null,
      messages: [],
    })
    mocks.sendMessage.mockResolvedValue(connectionId)
    mocks.markRead.mockResolvedValue(true)
    mocks.setInstagram.mockResolvedValue(true)
  })

  it('returns participant-safe metadata while messaging and Instagram are disabled', async () => {
    const response = await getDetail(request as never, routeContext)
    expect(response?.status).toBe(200)
    expect(await response!.json()).toEqual({
      connection: { id: connectionId, status: 'active', displayName: '연결된 사용자' },
      capabilities: { messaging: false, instagramPermission: false },
    })
    expect(mocks.context).toHaveBeenCalledWith(request)
    expect(mocks.detail).toHaveBeenCalledWith(actorId, connectionId)
    expect(mocks.beta.mock.calls.map((call) => call[2])).toEqual(['messaging', 'instagram_permission'])
    expect(response!.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
  })

  it('returns the existing login boundary before any connection lookup', async () => {
    mocks.context.mockResolvedValue({ response: new Response('{"error":"로그인이 필요합니다."}', { status: 401 }) })
    const response = await getDetail(request as never, routeContext)
    expect(response?.status).toBe(401)
    expect(mocks.detail).not.toHaveBeenCalled()
    expect(mocks.beta).not.toHaveBeenCalled()
  })

  it('contracts a non-participant or missing connection to the same unavailable response', async () => {
    mocks.detail.mockResolvedValue(null)
    const response = await getDetail(request as never, routeContext)
    expect(response?.status).toBe(404)
    expect(await response!.json()).toEqual({ error: '연결 정보를 확인할 수 없습니다.' })
    expect(mocks.beta).not.toHaveBeenCalled()
  })

  it('contracts an invalid connection identifier to the same unavailable response', async () => {
    const response = await getDetail(request as never, { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(response?.status).toBe(404)
    expect(await response!.json()).toEqual({ error: '연결 정보를 확인할 수 없습니다.' })
    expect(mocks.detail).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', getMessages],
    ['POST', postMessage],
    ['PATCH', patchMessages],
  ] as const)('keeps messages %s closed when messaging is disabled', async (_method, handler) => {
    mocks.context.mockResolvedValue({
      response: new Response('{"error":"LIMITED_BETA_ACCESS_REQUIRED"}', { status: 403 }),
    })
    const response = await handler(request as never, routeContext)
    expect(response?.status).toBe(403)
    expect(mocks.context).toHaveBeenCalledWith(request, 'message')
    expect(mocks.conversation).not.toHaveBeenCalled()
    expect(mocks.sendMessage).not.toHaveBeenCalled()
    expect(mocks.markRead).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', getInstagram],
    ['POST', postInstagram],
    ['DELETE', deleteInstagram],
  ] as const)('keeps Instagram %s closed when Instagram permission is disabled', async (_method, handler) => {
    mocks.context.mockResolvedValue({
      response: new Response('{"error":"LIMITED_BETA_ACCESS_REQUIRED"}', { status: 403 }),
    })
    const response = await handler(request as never, routeContext)
    expect(response?.status).toBe(403)
    expect(mocks.context).toHaveBeenCalledWith(request, 'instagram')
    expect(mocks.conversation).not.toHaveBeenCalled()
    expect(mocks.setInstagram).not.toHaveBeenCalled()
  })

  it('preserves the enabled messaging read flow and read marker', async () => {
    const getResponse = await getMessages(request as never, routeContext)
    expect(getResponse?.status).toBe(200)
    expect(mocks.conversation).toHaveBeenCalledWith(actorId, connectionId)

    const patchResponse = await patchMessages(request as never, routeContext)
    expect(patchResponse?.status).toBe(200)
    expect(mocks.markRead).toHaveBeenCalledWith(actorId, connectionId)
  })

  it('preserves enabled Instagram read and permission changes', async () => {
    const getResponse = await getInstagram(request as never, routeContext)
    expect(getResponse?.status).toBe(200)

    const postResponse = await postInstagram(request as never, routeContext)
    const deleteResponse = await deleteInstagram(request as never, routeContext)
    expect(postResponse?.status).toBe(200)
    expect(deleteResponse?.status).toBe(200)
    expect(mocks.setInstagram).toHaveBeenNthCalledWith(1, actorId, connectionId, true)
    expect(mocks.setInstagram).toHaveBeenNthCalledWith(2, actorId, connectionId, false)
  })
})
