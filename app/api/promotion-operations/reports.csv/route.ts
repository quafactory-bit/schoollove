import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { createOwnerPerformanceCsv } from '@/lib/promotionOperations'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { data } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (data !== true) return NextResponse.json({ error: '만 19세 이상 확인이 필요합니다.' }, { status: 403 })
  const csv = await createOwnerPerformanceCsv(auth.user.id)
  if (csv == null) return NextResponse.json({ error: '성과 보고서를 만들 수 없습니다.' }, { status: 500 })
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="promotion-performance.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
