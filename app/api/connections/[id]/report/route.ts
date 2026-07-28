import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SafetyReportSchema } from '@/lib/policy/connectionSafety'
import { requireConnectionContext, readJson } from '@/lib/api/connectionRoute'
import { reportConnectionSafety } from '@/lib/connections'

const IdSchema = z.string().uuid()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'report')
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  const body = SafetyReportSchema.safeParse(await readJson(request))
  if (!id.success || !body.success) return NextResponse.json({ error: '신고 내용을 확인해 주세요.' }, { status: 400 })
  const reported = await reportConnectionSafety({ userId: context.auth.user.id, connectionId: id.data, messageId: body.data.message_id, reasonCode: body.data.reason_code })
  return reported ? NextResponse.json({ reported: true }) : NextResponse.json({ error: '신고를 접수할 수 없습니다.' }, { status: 409 })
}
