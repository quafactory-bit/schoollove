import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { issuePromotionVerification } from '@/lib/promotions'
import { checkPromotionRateLimit, getPromotionRequestIp } from '@/lib/security/promotionRateLimit'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { data: adult } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (adult !== true) return NextResponse.json({ error: '만 19세 이상 확인과 필수 동의가 필요합니다.' }, { status: 403 })
  const rate = await checkPromotionRateLimit({ ip: getPromotionRequestIp(request), userId: auth.user.id, action: 'verification' })
  if (!rate.allowed) return NextResponse.json({ error: rate.status === 503 ? '안전 설정을 확인 중입니다.' : '요청 횟수를 초과했습니다.' }, { status: rate.status, headers: rate.retryAfter ? { 'Retry-After': String(rate.retryAfter) } : undefined })
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: '잘못된 계정입니다.' }, { status: 400 })
  const issued = await issuePromotionVerification(auth.user.id, id)
  if (!issued) return NextResponse.json({ error: '인증 코드를 발급할 수 없습니다.' }, { status: 409 })
  return NextResponse.json({ code: issued.code, expires_at: issued.expiresAt, instruction: 'Instagram 프로필 소개에 이 코드를 임시로 표시한 뒤 운영자 검수를 요청해 주세요.' })
}
