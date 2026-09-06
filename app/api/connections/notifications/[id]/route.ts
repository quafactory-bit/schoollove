import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readJson } from '@/lib/api/connectionRoute'
import { requireConnectionNotificationsContext } from '@/lib/api/connectionNotificationsRoute'
import { markOwnConnectionNotificationRead } from '@/lib/connections'

const IdSchema = z.string().uuid()
const BodySchema = z.object({ action: z.literal('read') }).strict()

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionNotificationsContext(request)
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  const body = BodySchema.safeParse(await readJson(request))
  if (!id.success || !body.success) return NextResponse.json({ error: '요청을 확인해 주세요.' }, { status: 400 })
  const read = await markOwnConnectionNotificationRead(context.auth.client, id.data)
  return read
    ? NextResponse.json({ read: true })
    : NextResponse.json({ error: '알림을 처리할 수 없습니다.' }, { status: 404 })
}
