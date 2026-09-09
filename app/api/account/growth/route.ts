import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { getSchoolGrowth } from '@/lib/schoolGrowthGame'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get('school'))
  if (!id.success) return NextResponse.json({ error: '학교를 확인해 주세요.' }, { status: 400 })
  const { data, error } = await auth.client.rpc('get_own_school_growth_contribution', { requested_school_id: id.data })
  if (error || !data) return NextResponse.json({ error: '성장 정보를 확인할 수 없어요.' }, { status: 404 })
  const growth = await getSchoolGrowth(id.data)
  return NextResponse.json({ contribution: { contributed: data.contributed === true, xp: data.xp === 150 ? 150 : data.xp === 100 ? 100 : 0 }, growth: growth.schools[0] ?? null }, { headers: { 'Cache-Control': 'private, no-store' } })
}
