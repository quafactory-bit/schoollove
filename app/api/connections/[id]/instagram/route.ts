import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConnectionContext } from '@/lib/api/connectionRoute'
import { getConversation, setInstagramPermission } from '@/lib/connections'

const IdSchema = z.string().uuid()

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'instagram')
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: '연결을 확인해 주세요.' }, { status: 400 })
  const conversation = await getConversation(context.auth.user.id, id.data)
  return conversation ? NextResponse.json({ instagramHandle: conversation.instagramHandle }) : NextResponse.json({ error: '연결을 확인할 수 없습니다.' }, { status: 404 })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return changePermission(request, params, true)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return changePermission(request, params, false)
}

async function changePermission(request: NextRequest, params: Promise<{ id: string }>, visible: boolean) {
  const context = await requireConnectionContext(request, 'instagram')
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: '연결을 확인해 주세요.' }, { status: 400 })
  const changed = await setInstagramPermission(context.auth.user.id, id.data, visible)
  return changed ? NextResponse.json({ visible }) : NextResponse.json({ error: 'Instagram 공개 상태를 바꿀 수 없습니다.' }, { status: 409 })
}
