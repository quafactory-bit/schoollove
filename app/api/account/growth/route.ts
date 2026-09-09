import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { getOwnSchoolGrowth } from '@/lib/ownerSchoolGrowth'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers })
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get('school'))
  if (!id.success) return NextResponse.json({ error: '학교를 확인해 주세요.' }, { status: 400, headers })
  const growth = await getOwnSchoolGrowth(auth.client, id.data)
  if (!growth) return NextResponse.json({ error: '성장 정보를 확인할 수 없어요.' }, { status: 404, headers })
  return NextResponse.json({ contribution: { contributed: growth.ownContributionXp > 0, xp: growth.ownContributionXp }, growth }, { headers })
}
