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
    const status = pushStatusCode(error)
    return NextResponse.json(
      {
        error: unavailable ? '푸시 환경변수가 설정되지 않았습니다.' : `테스트 알림을 보낼 수 없습니다. (${pushFailureReason(error)})`,
        // 만료된 구독이면 브라우저가 구독을 새로 만들어 한 번 더 시도한다.
        expired: status === 404 || status === 410,
      },
      { status: unavailable ? 503 : 502, headers: privateHeaders },
    )
  }

  return NextResponse.json({ sent: true }, { headers: privateHeaders })
}

// 관리자 점검용 실패 이유. 키 값이나 구독 주소는 넣지 않고 원인 종류와 응답 코드만 보여 준다.
function pushStatusCode(error: unknown): number | undefined {
  const status = error && typeof error === 'object' && 'statusCode' in error ? (error as { statusCode?: unknown }).statusCode : undefined
  return typeof status === 'number' ? status : undefined
}

function pushFailureReason(error: unknown): string {
  const status = pushStatusCode(error)
  if (status !== undefined) {
    if (status === 401 || status === 403) return `푸시 서버 응답 ${status}: VAPID 키가 구독과 맞지 않음`
    if (status === 404 || status === 410) return `푸시 서버 응답 ${status}: 만료된 구독`
    return `푸시 서버 응답 ${status}`
  }
  if (error instanceof Error && /vapid/i.test(error.message)) return 'VAPID 키·주체 형식 오류'
  return '푸시 서버에 연결하지 못함'
}
