import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { isSameOriginGrowthRequest } from '@/lib/growthReferral'

export async function POST(request: NextRequest) {
  if (!isSameOriginGrowthRequest(request)) return NextResponse.json({ error: '요청을 확인해 주세요.' }, { status: 403 })
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const parsed = z.object({ schoolId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '학교를 확인해 주세요.' }, { status: 400 })
  const { data, error } = await auth.client.rpc('create_school_growth_referral', { requested_school_id: parsed.data.schoolId })
  if (error) return NextResponse.json({ error: '지금은 공유 링크를 만들 수 없어요. 잠시 후 다시 시도해 주세요.' }, { status: error.message.includes('RATE_LIMIT') ? 429 : 403 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
