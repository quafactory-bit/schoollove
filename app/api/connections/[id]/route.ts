import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConnectionContext, readJson } from '@/lib/api/connectionRoute'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { blockConnectionUser, disconnectConnection, getConnectionDetail } from '@/lib/connections'

const IdSchema = z.string().uuid()
const ActionSchema = z.object({ action: z.literal('block') }).strict()

const unavailable = () => NextResponse.json({ error: '연결 정보를 확인할 수 없습니다.' }, { status: 404 })

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request)
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return unavailable()
  const connection = await getConnectionDetail(context.auth.user.id, id.data)
  if (!connection) return unavailable()
  const [messaging, instagramPermission] = await Promise.all([
    hasBetaFeatureAccess(context.auth.client, context.auth.user.id, 'messaging'),
    hasBetaFeatureAccess(context.auth.client, context.auth.user.id, 'instagram_permission'),
  ])
  return NextResponse.json(
    { connection, capabilities: { messaging, instagramPermission } },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'response', [])
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: '연결을 확인해 주세요.' }, { status: 400 })
  const disconnected = await disconnectConnection(context.auth.user.id, id.data)
  return disconnected ? NextResponse.json({ disconnected: true }) : NextResponse.json({ error: '연결을 해제할 수 없습니다.' }, { status: 409 })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'response', [])
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  const body = ActionSchema.safeParse(await readJson(request))
  if (!id.success || !body.success) return NextResponse.json({ error: '요청을 확인해 주세요.' }, { status: 400 })
  const blocked = await blockConnectionUser(context.auth.user.id, id.data)
  return blocked ? NextResponse.json({ blocked: true }) : NextResponse.json({ error: '차단할 수 없습니다.' }, { status: 409 })
}
