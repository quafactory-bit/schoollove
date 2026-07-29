import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ConnectionMessageSchema } from '@/lib/policy/connectionSafety'
import { requireConnectionContext, readJson } from '@/lib/api/connectionRoute'
import { getConversation, markConversationRead, sendConnectionMessage } from '@/lib/connections'

const IdSchema = z.string().uuid()

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'message')
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: '대화를 확인해 주세요.' }, { status: 400 })
  const conversation = await getConversation(context.auth.user.id, id.data)
  return conversation ? NextResponse.json({ conversation }) : NextResponse.json({ error: '대화를 볼 수 없습니다.' }, { status: 404 })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'message')
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  const body = ConnectionMessageSchema.safeParse(await readJson(request))
  if (!id.success || !body.success) return NextResponse.json({ error: '메시지를 확인해 주세요.' }, { status: 400 })
  const messageId = await sendConnectionMessage(context.auth.user.id, id.data, body.data.message)
  return messageId ? NextResponse.json({ messageId }, { status: 201 }) : NextResponse.json({ error: '연결 상태에서만 메시지를 보낼 수 있습니다.' }, { status: 409 })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'message')
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: '대화를 확인해 주세요.' }, { status: 400 })
  const marked = await markConversationRead(context.auth.user.id, id.data)
  return marked ? NextResponse.json({ read: true }) : NextResponse.json({ error: '읽음 처리할 수 없습니다.' }, { status: 409 })
}
