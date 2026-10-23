import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { PushSubscriptionSchema } from '@/lib/push/schema'
import { sendAdminTestPush } from '@/lib/push/send'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function POST(request: NextRequest) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: 'ADMIN_AUTH_REQUIRED' }, { status: 401, headers: privateHeaders })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400, headers: privateHeaders })
  }
  const parsed = PushSubscriptionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '테스트 알림 구독 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  }

  try {
    await sendAdminTestPush(parsed.data)
  } catch (error) {
    const unavailable = error instanceof Error && error.message === 'PUSH_NOT_CONFIGURED'
    return NextResponse.json(
      { error: unavailable ? '푸시 환경변수가 설정되지 않았습니다.' : '테스트 알림을 보낼 수 없습니다.' },
      { status: unavailable ? 503 : 502, headers: privateHeaders },
    )
  }

  return NextResponse.json({ sent: true }, { headers: privateHeaders })
}
