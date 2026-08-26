import { NextRequest, NextResponse } from 'next/server'
import { ConnectionRequestSchema } from '@/lib/policy/connectionSafety'
import { requireConnectionContext, readJson } from '@/lib/api/connectionRoute'
import { createConnectionRequest, getConnectionRequests } from '@/lib/connections'
import { recordLimitedLaunchEvent } from '@/lib/onboarding'

export async function GET(request: NextRequest) {
  const context = await requireConnectionContext(request, 'response', [])
  if ('response' in context) return context.response
  const result = await getConnectionRequests(context.auth.user.id)
  return result
    ? NextResponse.json(result)
    : NextResponse.json({ error: '안부 목록을 불러올 수 없습니다.' }, { status: 500 })
}

export async function POST(request: NextRequest) {
  const context = await requireConnectionContext(request, 'request')
  if ('response' in context) return context.response
  const parsed = ConnectionRequestSchema.safeParse(await readJson(request))
  if (!parsed.success) return NextResponse.json({ error: '안부 내용을 확인해 주세요.' }, { status: 400 })
  const result = await createConnectionRequest({
    userId: context.auth.user.id,
    matchToken: parsed.data.match_token,
    relationshipType: parsed.data.relationship_type,
    message: parsed.data.message,
  })
  if (!result) return NextResponse.json({ error: '안부를 보낼 수 없습니다.' }, { status: 503 })
  if (result.created) await recordLimitedLaunchEvent('connection_request_created')
  return NextResponse.json({ created: result.created, requestId: result.requestId, state: result.state }, { status: result.created ? 201 : 409 })
}
