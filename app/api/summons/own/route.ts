import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { SUMMONS_CODE, SUMMONS_ERRORS, checkSummonsName } from '@/lib/part2P3'

const headers = { 'Cache-Control': 'private, no-store' }
const Create = z.object({ school_id: z.string().uuid(), graduation_year: z.number().int().min(1950).max(2100), target_name: z.string().max(40) }).strict()
const Hide = z.object({ share_code: z.string().regex(SUMMONS_CODE) }).strict()

// Part 2 P3: create / list / take down my own summons. Same school·year and 3 per day are enforced in the DB.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers })
  const { data, error } = await auth.client.rpc('part2_list_own_summons')
  if (error) return NextResponse.json({ error: 'SUMMONS_UNAVAILABLE' }, { status: 503, headers })
  return NextResponse.json({ summons: data }, { headers })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers }) }
  const parsed = Create.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers })
  const name = checkSummonsName(parsed.data.target_name)
  if (!name.ok) return NextResponse.json({ error: 'SUMMONS_NAME_REJECTED', reason: name.reason }, { status: 400, headers })
  const { data, error } = await auth.client.rpc('part2_create_summons', {
    p_school_id: parsed.data.school_id, p_year: parsed.data.graduation_year, p_target_name: name.value,
  })
  if (error || typeof data !== 'string' || !SUMMONS_CODE.test(data)) {
    const code = Object.keys(SUMMONS_ERRORS).find((key) => error?.message?.includes(key)) ?? 'SUMMONS_NOT_CREATED'
    return NextResponse.json(
      { error: code, message: SUMMONS_ERRORS[code] ?? '지금은 소환장을 만들 수 없어요.' },
      { status: code === 'SUMMONS_DAILY_LIMIT' ? 429 : 400, headers },
    )
  }
  return NextResponse.json({ share_code: data }, { status: 201, headers })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers }) }
  const parsed = Hide.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers })
  const { data, error } = await auth.client.rpc('part2_hide_own_summons', { p_code: parsed.data.share_code })
  if (error) return NextResponse.json({ error: 'SUMMONS_UNAVAILABLE' }, { status: 503, headers })
  return NextResponse.json({ hidden: data === true }, { headers })
}
