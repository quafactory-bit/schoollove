import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { PromotionOwnerOperationSchema } from '@/lib/policy/promotionOperations'
import { applyPromotionOwnerOperation, getPromotionOperationsOwnerState } from '@/lib/promotionOperations'
import { checkPromotionRateLimit, getPromotionRequestIp } from '@/lib/security/promotionRateLimit'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { data: adult } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (adult !== true) return NextResponse.json({ error: '만 19세 이상 확인과 필수 동의가 필요합니다.' }, { status: 403 })
  const state = await getPromotionOperationsOwnerState(auth.user.id)
  return state ? NextResponse.json(state) : NextResponse.json({ error: '프로모션 운영 정보를 불러올 수 없습니다.' }, { status: 500 })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { data: adult } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (adult !== true) return NextResponse.json({ error: '만 19세 이상 확인과 필수 동의가 필요합니다.' }, { status: 403 })
  const rate = await checkPromotionRateLimit({ ip: getPromotionRequestIp(request), userId: auth.user.id, action: 'request' })
  if (!rate.allowed) return NextResponse.json({ error: rate.status === 503 ? '안전 설정을 확인 중입니다.' : '요청 횟수를 초과했습니다.' }, { status: rate.status, headers: rate.retryAfter ? { 'Retry-After': String(rate.retryAfter) } : undefined })
  const parsed = PromotionOwnerOperationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '요청 값과 중복 방지 키를 확인해 주세요.' }, { status: 400 })
  const result = await applyPromotionOwnerOperation(auth.user.id, parsed.data)
  return result !== null ? NextResponse.json({ applied: true, result }) : NextResponse.json({ error: '현재 상태에서 요청을 처리할 수 없습니다.' }, { status: 409 })
}
