import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'

const DeletionSchema = z.object({ reason: z.string().trim().max(500).nullable().optional() })

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const parsed = DeletionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '요청 내용을 확인해 주세요.' }, { status: 400 })

  const { error } = await auth.client.from('account_deletion_requests').insert({
    user_id: auth.user.id,
    reason: parsed.data.reason || null,
    status: 'pending',
  })
  if (error?.code === '23505') return NextResponse.json({ requested: true })
  if (error) return NextResponse.json({ error: '탈퇴 요청을 접수할 수 없습니다.' }, { status: 500 })

  await auth.client.from('private_profiles').update({
    status: 'deletion_requested',
    updated_at: new Date().toISOString(),
  }).eq('owner_user_id', auth.user.id)

  return NextResponse.json({ requested: true }, { status: 201 })
}
