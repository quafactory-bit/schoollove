import { NextRequest, NextResponse } from 'next/server'
import { requireConnectionContext } from '@/lib/api/connectionRoute'
import { getConnections } from '@/lib/connections'

export async function GET(request: NextRequest) {
  const context = await requireConnectionContext(request)
  if ('response' in context) return context.response
  const connections = await getConnections(context.auth.user.id)
  return connections
    ? NextResponse.json({ connections })
    : NextResponse.json({ error: '연결 목록을 불러올 수 없습니다.' }, { status: 500 })
}
