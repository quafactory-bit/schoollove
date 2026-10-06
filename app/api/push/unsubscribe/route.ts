import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { PushUnsubscribeSchema } from '@/lib/push/schema'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: privateHeaders })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400, headers: privateHeaders })
  }
  const parsed = PushUnsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '알림 구독 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from('push_subscriptions')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('endpoint', parsed.data.endpoint)
    if (error) throw error
  } catch {
    return NextResponse.json({ error: '알림 구독을 해지할 수 없습니다.' }, { status: 503, headers: privateHeaders })
  }

  return NextResponse.json({ unsubscribed: true }, { headers: privateHeaders })
}
