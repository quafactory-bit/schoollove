import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase'

const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
const Hide = z.object({ id: z.string().uuid() }).strict()

// Part 2 P3: admin list (no creator identity) and take-down.
export async function GET(request: NextRequest) {
  if (!await requireAdminSession(request)) return NextResponse.json({ error: 'ADMIN_AUTH_REQUIRED' }, { status: 401, headers })
  try {
    const { data, error } = await getSupabaseAdmin().rpc('part2_admin_list_summons')
    if (error) return NextResponse.json({ error: 'SUMMONS_UNAVAILABLE' }, { status: 503, headers })
    return NextResponse.json({ summons: data }, { headers })
  } catch {
    return NextResponse.json({ error: 'SUMMONS_UNAVAILABLE' }, { status: 503, headers })
  }
}

export async function POST(request: NextRequest) {
  if (!await requireAdminSession(request)) return NextResponse.json({ error: 'ADMIN_AUTH_REQUIRED' }, { status: 401, headers })
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers }) }
  const parsed = Hide.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers })
  try {
    const { data, error } = await getSupabaseAdmin().rpc('part2_admin_hide_summons', { p_id: parsed.data.id })
    if (error) return NextResponse.json({ error: 'SUMMONS_UNAVAILABLE' }, { status: 503, headers })
    return NextResponse.json({ hidden: data === true }, { headers })
  } catch {
    return NextResponse.json({ error: 'SUMMONS_UNAVAILABLE' }, { status: 503, headers })
  }
}
