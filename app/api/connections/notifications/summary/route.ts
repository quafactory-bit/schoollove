import { NextRequest, NextResponse } from 'next/server'
import { requireConnectionNotificationsContext } from '@/lib/api/connectionNotificationsRoute'
import { getOwnConnectionNotificationUnreadCount } from '@/lib/connections'

export async function GET(request: NextRequest) {
  const context = await requireConnectionNotificationsContext(request)
  if ('response' in context) return context.response
  const unreadCount = await getOwnConnectionNotificationUnreadCount(context.auth.client)
  return unreadCount !== null
    ? NextResponse.json({ unreadCount }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
    : NextResponse.json({ error: '알림을 불러올 수 없습니다.' }, { status: 500 })
}
