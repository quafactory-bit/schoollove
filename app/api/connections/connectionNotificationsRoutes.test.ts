import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  mark: vi.fn(),
  readJson: vi.fn(),
}))

vi.mock('@/lib/api/connectionNotificationsRoute', () => ({ requireConnectionNotificationsContext: mocks.context }))
vi.mock('@/lib/api/connectionRoute', () => ({ readJson: mocks.readJson }))
vi.mock('@/lib/connections', () => ({
  getOwnConnectionNotifications: mocks.list,
  getOwnConnectionNotificationUnreadCount: mocks.count,
  markOwnConnectionNotificationRead: mocks.mark,
}))

import { GET as getNotifications } from './notifications/route'
import { GET as getSummary } from './notifications/summary/route'
import { PATCH as markRead } from './notifications/[id]/route'

const actorId = '00000000-0000-4000-8000-000000000001'
const notificationId = '00000000-0000-4000-8000-000000000002'
const auth = { user: { id: actorId }, client: {} }
const request = new Request('http://localhost/api/connections/notifications')
const routeContext = { params: Promise.resolve({ id: notificationId }) }

describe('connection notification routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.mockResolvedValue({ auth })
    mocks.list.mockResolvedValue([{ id: notificationId, type: 'request_received', createdAt: '2026-09-04T00:00:00.000Z', read: false }])
    mocks.count.mockResolvedValue(1)
    mocks.mark.mockResolvedValue(true)
    mocks.readJson.mockResolvedValue({ action: 'read' })
  })

  it('returns only the minimal list payload through the owner boundary', async () => {
    const response = await getNotifications(request as never)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ notifications: [{ id: notificationId, type: 'request_received', createdAt: '2026-09-04T00:00:00.000Z', read: false }] })
    expect(mocks.list).toHaveBeenCalledWith(auth.client, 20)
  })

  it('returns the own unread count without a polling contract', async () => {
    const response = await getSummary(request as never)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ unreadCount: 1 })
    expect(mocks.count).toHaveBeenCalledWith(auth.client)
  })

  it('marks only the validated notification id as read', async () => {
    const response = await markRead(new Request('http://localhost/api/connections/notifications/id', { method: 'PATCH' }) as never, routeContext)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ read: true })
    expect(mocks.mark).toHaveBeenCalledWith(auth.client, notificationId)
  })

  it('does not disclose unavailable or foreign ids', async () => {
    mocks.mark.mockResolvedValue(false)
    const response = await markRead(new Request('http://localhost/api/connections/notifications/id', { method: 'PATCH' }) as never, routeContext)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: '알림을 처리할 수 없습니다.' })
  })
})
