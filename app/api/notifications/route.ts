import { NextRequest, NextResponse } from 'next/server'
import { requireConnectionContext } from '@/lib/api/connectionRoute'
import { getNotifications, markNotificationsRead } from '@/lib/connections'

export async function GET(request: NextRequest) {
  const context = await requireConnectionContext(request)
  if ('response' in context) return context.response
  const notifications = await getNotifications(context.auth.user.id)
  return notifications ? NextResponse.json({ notifications }) : NextResponse.json({ error: '알림을 불러올 수 없습니다.' }, { status: 500 })
}

export async function PATCH(request: NextRequest) {
  const context = await requireConnectionContext(request)
  if ('response' in context) return context.response
  const marked = await markNotificationsRead(context.auth.user.id)
  return marked ? NextResponse.json({ read: true }) : NextResponse.json({ error: '알림을 처리할 수 없습니다.' }, { status: 500 })
}
