import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_COOKIE_NAME, verifySessionToken } from '@/lib/admin-auth'
import { applyAdminConnectionSafetyAction, getAdminSafetyReports } from '@/lib/connections'

const ActionSchema = z.object({
  report_id: z.string().uuid(),
  action: z.enum(['report_close','request_force_close','message_hide','account_suspend','account_restore']),
}).strict()

async function requireAdmin(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  return Boolean(password && token && await verifySessionToken(token, password))
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  const reports = await getAdminSafetyReports()
  return reports
    ? NextResponse.json({ reports })
    : NextResponse.json({ error: '안전 신고를 불러올 수 없습니다.' }, { status: 500 })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { body = null }
  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '요청을 확인해 주세요.' }, { status: 400 })
  const applied = await applyAdminConnectionSafetyAction(parsed.data.action, parsed.data.report_id)
  return applied ? NextResponse.json({ applied: true }) : NextResponse.json({ error: '안전 조치를 적용할 수 없습니다.' }, { status: 409 })
}
