import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConnectionContext } from '@/lib/api/connectionRoute'
import { remindConnectionRequest } from '@/lib/connections'

const IdSchema = z.string().uuid()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'reminder')
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: '요청을 확인해 주세요.' }, { status: 400 })
  const reminded = await remindConnectionRequest(context.auth.user.id, id.data)
  return reminded
    ? NextResponse.json({ reminded: true })
    : NextResponse.json({ error: '7일 후 pending 안부에 한 번만 사용할 수 있습니다.' }, { status: 409 })
}
