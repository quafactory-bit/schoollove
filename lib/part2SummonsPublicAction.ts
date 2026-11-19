import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase'
import { SUMMONS_CODE } from '@/lib/part2P3'
import { allowPart2SummonsAction } from '@/lib/security/part2SummonsRateLimit'

const headers = { 'Cache-Control': 'no-store' }
const Body = z.object({ share_code: z.string().regex(SUMMONS_CODE) }).strict()
const FUNCTIONS = { takedown: 'part2_request_summons_takedown', report: 'part2_report_summons' } as const

/** Part 2 P3: public summons takedown/report. Same-origin only, rate limited, server role only. */
export async function handlePublicSummonsAction(request: NextRequest, action: keyof typeof FUNCTIONS) {
  if (request.headers.get('origin') !== request.nextUrl.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
  }
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers }) }
  const parsed = Body.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers })
  if (!await allowPart2SummonsAction(request, action)) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429, headers })
  try {
    const { error } = await getSupabaseAdmin().rpc(FUNCTIONS[action], { p_code: parsed.data.share_code })
    if (error) return NextResponse.json({ error: 'SUMMONS_UNAVAILABLE' }, { status: 503, headers })
    // Same answer whether or not the code existed, so the endpoint cannot be used to probe codes.
    return NextResponse.json({ ok: true }, { headers })
  } catch {
    return NextResponse.json({ error: 'SUMMONS_UNAVAILABLE' }, { status: 503, headers })
  }
}
