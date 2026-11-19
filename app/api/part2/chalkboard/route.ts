import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'

const headers = { 'Cache-Control': 'private, no-store' }
const Query = z.object({ school_id: z.string().uuid(), year: z.coerce.number().int().min(1950).max(2100) }).strict()

// Part 2 P3: same school·year chalkboard (members only, locked below 3 members — enforced in the DB).
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers })
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers })
  const { data, error } = await auth.client.rpc('part2_get_year_chalkboard', { p_school_id: parsed.data.school_id, p_year: parsed.data.year })
  if (error) return NextResponse.json({ error: 'CHALKBOARD_UNAVAILABLE' }, { status: error.message?.includes('REQUIRED') ? 403 : 503, headers })
  return NextResponse.json({ board: data }, { headers })
}
