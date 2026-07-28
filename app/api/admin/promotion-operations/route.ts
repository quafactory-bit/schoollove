import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifySessionToken } from '@/lib/admin-auth'
import { PromotionAdminOperationSchema } from '@/lib/policy/promotionOperations'
import { applyPromotionAdminOperation, getPromotionOperationsAdminState } from '@/lib/promotionOperations'

async function requireAdmin(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  return Boolean(password && token && await verifySessionToken(token, password))
}

const filterValue = (value: string | null) => value && /^[A-Za-z0-9_-]{2,40}$/.test(value) ? value : undefined

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  const state = await getPromotionOperationsAdminState({ status: filterValue(request.nextUrl.searchParams.get('status')), school: filterValue(request.nextUrl.searchParams.get('school')), region: filterValue(request.nextUrl.searchParams.get('region')) })
  return state ? NextResponse.json(state) : NextResponse.json({ error: '운영 정보를 불러올 수 없습니다.' }, { status: 500 })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  const parsed = PromotionAdminOperationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '운영 작업 값을 확인해 주세요.' }, { status: 400 })
  const result = await applyPromotionAdminOperation(parsed.data)
  return result.error ? NextResponse.json({ error: '현재 상태에서 작업을 적용할 수 없습니다.' }, { status: 409 }) : NextResponse.json({ applied: true, result: result.data })
}
