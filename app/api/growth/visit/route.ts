import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase'
import { GROWTH_TOKEN_PATTERN, GROWTH_VISIT_COOKIE, isSameOriginGrowthRequest } from '@/lib/growthReferral'
import { allowGrowthVisit } from '@/lib/security/growthRateLimit'

export async function POST(request: NextRequest) {
  if (!isSameOriginGrowthRequest(request)) return NextResponse.json({ accepted: false }, { status: 403 })
  if (!await allowGrowthVisit(request)) return NextResponse.json({ accepted: false }, { status: 429 })
  const parsed = z.object({ token: z.string().regex(GROWTH_TOKEN_PATTERN) }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ accepted: false }, { status: 400 })
  // The token is never logged or reflected. Invalid attribution cannot block a school visit.
  try {
    const { data, error } = await getSupabaseAdmin().rpc('create_school_growth_visit', { requested_token: parsed.data.token })
    const response = NextResponse.json({ accepted: !error && Boolean(data?.proof) }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
    if (!error && GROWTH_TOKEN_PATTERN.test(data?.proof ?? '')) response.cookies.set(GROWTH_VISIT_COOKIE, data.proof, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86400,
    })
    return response
  } catch { return NextResponse.json({ accepted: false }, { status: 503 }) }
}
