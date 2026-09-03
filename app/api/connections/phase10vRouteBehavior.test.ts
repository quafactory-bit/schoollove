import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  actionContext: vi.fn(),
  readJson: vi.fn(),
  getRequests: vi.fn(),
  createRequest: vi.fn(),
  respondRequest: vi.fn(),
  remindRequest: vi.fn(),
  getInstagramState: vi.fn(),
  setInstagramPermission: vi.fn(),
  cancelRequest: vi.fn(),
  record: vi.fn(),
}))

vi.mock('@/lib/api/connectionRoute', () => ({
  requireConnectionContext: mocks.context,
  requireConnectionActionContext: mocks.actionContext,
  readJson: mocks.readJson,
}))
vi.mock('@/lib/connections', () => ({
  getConnectionRequests: mocks.getRequests,
  createConnectionRequest: mocks.createRequest,
  respondConnectionRequest: mocks.respondRequest,
  remindConnectionRequest: mocks.remindRequest,
  getConnectionInstagramState: mocks.getInstagramState,
  setInstagramPermission: mocks.setInstagramPermission,
  cancelConnectionRequest: mocks.cancelRequest,
}))
vi.mock('@/lib/onboarding', () => ({ recordLimitedLaunchEvent: mocks.record }))

import { GET as getRequests, POST as postRequest } from './requests/route'
import { PATCH as patchRequest } from './requests/[id]/route'
import { POST as postReminder } from './requests/[id]/reminder/route'
import { GET as getInstagram } from './[id]/instagram/route'

const actorId = '00000000-0000-4000-8000-000000000001'
const objectId = '00000000-0000-4000-8000-000000000002'
const auth = { user: { id: actorId }, client: {} }
const request = new Request('http://localhost/api/connections', { method: 'POST' })
const routeContext = { params: Promise.resolve({ id: objectId }) }

describe('PHASE 10V connection route action boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.mockResolvedValue({ auth })
    mocks.actionContext.mockResolvedValue({ auth })
    mocks.getRequests.mockResolvedValue({ incoming: [], outgoing: [] })
    mocks.createRequest.mockResolvedValue({ created: true, requestId: objectId, state: 'pending' })
    mocks.respondRequest.mockResolvedValue({ handled: true, state: 'declined', connectionId: null })
    mocks.remindRequest.mockResolvedValue(true)
    mocks.getInstagramState.mockResolvedValue({
      instagramHandle: null,
      myInstagramConfigured: true,
      myInstagramVisible: false,
    })
  })

  it('keeps an authenticated existing-request safety read available without discovery feature gates', async () => {
    const response = await getRequests(request as never)
    expect(response?.status).toBe(200)
    expect(mocks.context).toHaveBeenCalledWith(request, 'response', [])
    expect(mocks.getRequests).toHaveBeenCalledWith(actorId)
  })

  it('requires the public-active request context for request creation and reminders', async () => {
    mocks.readJson.mockResolvedValue({
      match_token: objectId,
      relationship_type: 'same_school',
      message: '나 완이야. 오랜만이야.',
    })
    expect((await postRequest(request as never))?.status).toBe(201)
    expect(mocks.context).toHaveBeenCalledWith(request, 'request')

    vi.clearAllMocks()
    mocks.context.mockResolvedValue({ auth })
    mocks.remindRequest.mockResolvedValue(true)
    expect((await postReminder(request as never, routeContext))?.status).toBe(200)
    expect(mocks.context).toHaveBeenCalledWith(request, 'reminder')
  })

  it('requires both discovery features and public-active authority for accept', async () => {
    mocks.readJson.mockResolvedValue({ action: 'accept' })
    mocks.respondRequest.mockResolvedValue({ handled: true, state: 'accepted', connectionId: objectId })
    const response = await patchRequest(request as never, routeContext)
    expect(response?.status).toBe(200)
    expect(mocks.actionContext).toHaveBeenCalledWith(
      request,
      auth,
      'response',
      ['people_search', 'connection_request'],
      { requirePublicAccountActive: true },
    )
  })

  it.each(['decline', 'not_the_person', 'block', 'report'] as const)(
    'keeps receiver safety action %s independent of discovery flags and public-active state',
    async (action) => {
      mocks.readJson.mockResolvedValue({ action, reason_code: action === 'report' ? 'other' : undefined })
      mocks.respondRequest.mockResolvedValue({ handled: true, state: action, connectionId: null })
      const response = await patchRequest(request as never, routeContext)
      expect(response?.status).toBe(200)
      expect(mocks.actionContext).toHaveBeenCalledWith(
        request,
        auth,
        'response',
        [],
        { requirePublicAccountActive: false },
      )
    },
  )

  it('denies Instagram GET at the feature gate before any private conversation lookup', async () => {
    const denied = new Response('{"error":"LIMITED_BETA_ACCESS_REQUIRED"}', { status: 403 })
    mocks.context.mockResolvedValue({ response: denied })
    const response = await getInstagram(request as never, routeContext)
    expect(response?.status).toBe(403)
    expect(mocks.context).toHaveBeenCalledWith(request, 'instagram')
    expect(mocks.getInstagramState).not.toHaveBeenCalled()
  })
})
