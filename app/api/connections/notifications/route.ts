import { NextRequest, NextResponse } from 'next/server'
import { requireConnectionNotificationsContext } from '@/lib/api/connectionNotificationsRoute'
import { getOwnConnectionNotifications } from '@/lib/connections'

export async function GET(request: NextRequest) {
  const context = await requireConnectionNotificationsContext(request)
  if ('response' in context) return context.response
  const notifications = await getOwnConnectionNotifications(context.auth.client, 20)
  return notifications
    ? NextResponse.json({ notifications }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
    : NextResponse.json({ error: '알림을 불러올 수 없습니다.' }, { status: 500 })
}
