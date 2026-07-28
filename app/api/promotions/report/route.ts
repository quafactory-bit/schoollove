import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { PromotionReportSchema } from '@/lib/policy/promotionSafety'
import { reportPromotion } from '@/lib/promotions'
import { checkPromotionRateLimit, getPromotionRequestIp } from '@/lib/security/promotionRateLimit'

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const rate = await checkPromotionRateLimit({ ip: getPromotionRequestIp(request), userId: auth.user.id, action: 'report' })
  if (!rate.allowed) return NextResponse.json({ error: rate.status === 503 ? '안전 설정을 확인 중입니다.' : '신고 요청 횟수를 초과했습니다.' }, { status: rate.status, headers: rate.retryAfter ? { 'Retry-After': String(rate.retryAfter) } : undefined })
  const parsed = PromotionReportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '신고 사유를 확인해 주세요.' }, { status: 400 })
  const reported = await reportPromotion(auth.user.id, parsed.data.placement_id, parsed.data.reason_code)
  return reported ? NextResponse.json({ reported: true }) : NextResponse.json({ error: '이미 접수되었거나 신고할 수 없습니다.' }, { status: 409 })
}
