import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { PushSubscriptionSchema } from '@/lib/push/schema'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: privateHeaders })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400, headers: privateHeaders })
  }
  const parsed = PushSubscriptionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '알림 구독 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return NextResponse.json({ error: '동창 알림을 준비 중입니다.' }, { status: 503, headers: privateHeaders })
  }

  try {
    const { error } = await getSupabaseAdmin().from('push_subscriptions').upsert({
      user_id: auth.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 1000) ?? null,
    }, { onConflict: 'endpoint' })
    if (error) throw error
  } catch {
    return NextResponse.json({ error: '알림 구독을 저장할 수 없습니다.' }, { status: 503, headers: privateHeaders })
  }

  return NextResponse.json({ subscribed: true }, { status: 201, headers: privateHeaders })
}
