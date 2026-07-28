import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifySessionToken } from '@/lib/admin-auth'
import { PromotionAdminActionSchema } from '@/lib/policy/promotionSafety'
import { applyAdminPromotionAction, getAdminPromotionState } from '@/lib/promotions'

async function requireAdmin(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  return Boolean(password && token && await verifySessionToken(token, password))
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  const state = await getAdminPromotionState()
  return state ? NextResponse.json(state) : NextResponse.json({ error: '광고 운영 정보를 불러올 수 없습니다.' }, { status: 500 })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  const parsed = PromotionAdminActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '운영 작업 값을 확인해 주세요.' }, { status: 400 })
  const applied = await applyAdminPromotionAction(parsed.data)
  return applied ? NextResponse.json({ applied: true }) : NextResponse.json({ error: '현재 상태에서 작업을 적용할 수 없습니다.' }, { status: 409 })
}
