import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { PromotionAccountSchema } from '@/lib/policy/promotionSafety'
import { createPromotionAccount, getPromotionOwnerState } from '@/lib/promotions'
import { checkPromotionRateLimit, getPromotionRequestIp } from '@/lib/security/promotionRateLimit'
import { hasBetaFeatureAccess } from '@/lib/beta'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!(await hasBetaFeatureAccess(auth.client,auth.user.id,'promotion_application'))) return NextResponse.json({ error:'LIMITED_BETA_ACCESS_REQUIRED' },{ status:403 })
  const state = await getPromotionOwnerState(auth.user.id)
  return state ? NextResponse.json(state) : NextResponse.json({ error: '신청 정보를 불러올 수 없습니다.' }, { status: 500 })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!(await hasBetaFeatureAccess(auth.client,auth.user.id,'promotion_application'))) return NextResponse.json({ error:'LIMITED_BETA_ACCESS_REQUIRED' },{ status:403 })
  const rate = await checkPromotionRateLimit({ ip: getPromotionRequestIp(request), userId: auth.user.id, action: 'account' })
  if (!rate.allowed) return NextResponse.json({ error: rate.status === 503 ? '안전 설정을 확인 중입니다.' : '요청 횟수를 초과했습니다.' }, { status: rate.status, headers: rate.retryAfter ? { 'Retry-After': String(rate.retryAfter) } : undefined })
  const { data: adult } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (adult !== true) return NextResponse.json({ error: '만 19세 이상 확인과 필수 동의가 필요합니다.' }, { status: 403 })
  let body: unknown
  try { body = await request.json() } catch { body = null }
  const parsed = PromotionAccountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '계정 정보를 확인해 주세요.' }, { status: 400 })
  const account = await createPromotionAccount(auth.user.id, parsed.data)
  return account ? NextResponse.json({ account }, { status: 201 }) : NextResponse.json({ error: '계정을 만들 수 없습니다.' }, { status: 409 })
}
