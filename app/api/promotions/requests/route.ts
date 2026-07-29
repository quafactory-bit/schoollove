import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { PromotionRequestSchema } from '@/lib/policy/promotionSafety'
import { getPromotionOwnerState, submitPromotionRequest } from '@/lib/promotions'
import { checkPromotionRateLimit, getPromotionRequestIp } from '@/lib/security/promotionRateLimit'
import { hasBetaFeatureAccess } from '@/lib/beta'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!(await hasBetaFeatureAccess(auth.client,auth.user.id,'promotion_application'))) return NextResponse.json({ error:'LIMITED_BETA_ACCESS_REQUIRED' },{ status:403 })
  const state = await getPromotionOwnerState(auth.user.id)
  return state ? NextResponse.json({ requests: state.requests }) : NextResponse.json({ error: '신청 정보를 불러올 수 없습니다.' }, { status: 500 })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!(await hasBetaFeatureAccess(auth.client,auth.user.id,'promotion_application'))) return NextResponse.json({ error:'LIMITED_BETA_ACCESS_REQUIRED' },{ status:403 })
  const rate = await checkPromotionRateLimit({ ip: getPromotionRequestIp(request), userId: auth.user.id, action: 'request' })
  if (!rate.allowed) return NextResponse.json({ error: rate.status === 503 ? '안전 설정을 확인 중입니다.' : '요청 횟수를 초과했습니다.' }, { status: rate.status, headers: rate.retryAfter ? { 'Retry-After': String(rate.retryAfter) } : undefined })
  const { data: adult } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (adult !== true) return NextResponse.json({ error: '만 19세 이상 확인과 필수 동의가 필요합니다.' }, { status: 403 })
  let body: unknown
  try { body = await request.json() } catch { body = null }
  const parsed = PromotionRequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '광고 문구·URL·동의 항목을 확인해 주세요.' }, { status: 400 })
  const result = await submitPromotionRequest(auth.user.id, parsed.data)
  return result ? NextResponse.json({ request: result }, { status: 201 }) : NextResponse.json({ error: '검증된 본인 계정만 신청할 수 있습니다.' }, { status: 409 })
}
