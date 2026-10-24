import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { RequestActionSchema } from '@/lib/policy/connectionSafety'
import { requireConnectionActionContext, requireConnectionContext, readJson } from '@/lib/api/connectionRoute'
import { cancelConnectionRequest, respondConnectionRequest } from '@/lib/connections'
import { notifyRequestAccepted } from '@/lib/push/send'

const IdSchema = z.string().uuid()

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request)
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  const body = RequestActionSchema.safeParse(await readJson(request))
  if (!id.success || !body.success) return NextResponse.json({ error: '요청을 확인해 주세요.' }, { status: 400 })
  const actionContext = await requireConnectionActionContext(
    request,
    context.auth,
    'response',
    body.data.action === 'accept' ? ['people_search','connection_request'] : [],
    { requirePublicAccountActive: body.data.action === 'accept' },
  )
  if ('response' in actionContext) return actionContext.response
  const result = await respondConnectionRequest({
    userId: context.auth.user.id, requestId: id.data, action: body.data.action, reasonCode: body.data.reason_code,
  })
  if (!result?.handled) return NextResponse.json({ error: '이미 처리됐거나 처리할 수 없는 안부입니다.' }, { status: 409 })
  // v2-09a: 수락이면 요청한 사람에게 알림(응답 뒤, 실패해도 수락 결과 불변).
  if (body.data.action === 'accept') { const requestId = id.data; after(async () => { await notifyRequestAccepted(requestId) }) }
  return NextResponse.json({ state: result.state, connectionId: result.connectionId })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'response')
  if ('response' in context) return context.response
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: '요청을 확인해 주세요.' }, { status: 400 })
  const cancelled = await cancelConnectionRequest(context.auth.user.id, id.data)
  return cancelled
    ? NextResponse.json({ cancelled: true })
    : NextResponse.json({ error: '취소할 수 없는 안부입니다.' }, { status: 409 })
}
