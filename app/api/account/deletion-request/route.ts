import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'

const DeletionSchema = z.object({ confirm: z.literal(true) }).strict()

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const parsed = DeletionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '요청 내용을 확인해 주세요.' }, { status: 400 })

  // The authenticated RPC derives auth.uid() itself and atomically records the request
  // plus the private-profile state transition. Body user IDs are never accepted.
  const { data: requested, error } = await auth.client.rpc('request_own_account_deletion')
  if (error || requested !== true) {
    return NextResponse.json({ error: '탈퇴 요청을 접수할 수 없습니다.' }, { status: 500 })
  }

  return NextResponse.json({ requested: true }, { status: 201 })
}
