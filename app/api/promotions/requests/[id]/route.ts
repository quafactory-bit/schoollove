import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { isPromotionTextSafe, isSafeHttpsUrl, isSafePromotionImageUrl, normalizePromotionText } from '@/lib/policy/promotionSafety'
import { cancelPromotionRequest, revisePromotionRequest } from '@/lib/promotions'
import { checkPromotionRateLimit, getPromotionRequestIp } from '@/lib/security/promotionRateLimit'
import { hasBetaFeatureAccess } from '@/lib/beta'

const RevisionSchema = z.object({
  title: z.string().transform(normalizePromotionText).pipe(z.string().min(1).max(80).refine(isPromotionTextSafe)),
  body: z.string().transform(normalizePromotionText).pipe(z.string().min(1).max(300).refine(isPromotionTextSafe)),
  image_url: z.string().max(500).refine(isSafePromotionImageUrl), landing_url: z.string().max(500).refine(isSafeHttpsUrl),
}).strict()

async function context(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return null
  if (!(await hasBetaFeatureAccess(auth.client,auth.user.id,'promotion_application'))) return { auth, rate:{ allowed:false as const, status:403 as const } }
  const rate = await checkPromotionRateLimit({ ip: getPromotionRequestIp(request), userId: auth.user.id, action: 'request' })
  return { auth, rate }
}

export async function PATCH(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  const requestContext = await context(request)
  if (!requestContext) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!requestContext.rate.allowed) return NextResponse.json({ error: '요청을 잠시 후 다시 시도해 주세요.' }, { status: requestContext.rate.status })
  const { id } = await route.params
  const parsed = RevisionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '수정 값을 확인해 주세요.' }, { status: 400 })
  const revised = await revisePromotionRequest(requestContext.auth.user.id, id, parsed.data)
  return revised ? NextResponse.json({ revised: true }) : NextResponse.json({ error: '수정 요청 상태에서만 변경할 수 있습니다.' }, { status: 409 })
}

export async function DELETE(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  const requestContext = await context(request)
  if (!requestContext) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (!requestContext.rate.allowed) return NextResponse.json({ error: '요청을 잠시 후 다시 시도해 주세요.' }, { status: requestContext.rate.status })
  const { id } = await route.params
  const cancelled = await cancelPromotionRequest(requestContext.auth.user.id, id)
  return cancelled ? NextResponse.json({ cancelled: true }) : NextResponse.json({ error: '결제 확인 전 신청만 취소할 수 있습니다.' }, { status: 409 })
}
