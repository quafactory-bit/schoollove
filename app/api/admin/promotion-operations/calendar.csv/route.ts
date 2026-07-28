import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifySessionToken } from '@/lib/admin-auth'
import { createAdminCalendarCsv } from '@/lib/promotionOperations'

async function requireAdmin(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  return Boolean(password && token && await verifySessionToken(token, password))
}

const filterValue = (value: string | null) => value && /^[A-Za-z0-9_-]{2,40}$/.test(value) ? value : undefined

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  const csv = await createAdminCalendarCsv({ status: filterValue(request.nextUrl.searchParams.get('status')), school: filterValue(request.nextUrl.searchParams.get('school')), region: filterValue(request.nextUrl.searchParams.get('region')) })
  if (csv == null) return NextResponse.json({ error: '캘린더를 내보낼 수 없습니다.' }, { status: 500 })
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="promotion-calendar.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
