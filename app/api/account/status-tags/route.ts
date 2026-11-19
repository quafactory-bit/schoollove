import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { checkStatusTags } from '@/lib/part2P3'

const headers = { 'Cache-Control': 'private, no-store' }

// Part 2 P3: own 근황 태그·한마디. The DB function only ever reads/writes auth.uid()'s row.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers })
  const { data, error } = await auth.client.rpc('part2_get_own_status_tags')
  if (error) return NextResponse.json({ error: 'STATUS_TAGS_UNAVAILABLE' }, { status: 503, headers })
  return NextResponse.json({ status: data }, { headers })
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers }) }
  if (!body || typeof body !== 'object' || Object.keys(body).sort().join(',') !== 'note,show_on_school_page,tags') {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400, headers })
  }
  const checked = checkStatusTags({ tags: body.tags, note: body.note, show_on_school_page: body.show_on_school_page })
  if (!checked.ok) return NextResponse.json({ error: checked.reason }, { status: 400, headers })
  const { data, error } = await auth.client.rpc('part2_set_own_status_tags', {
    requested_tags: checked.value.tags,
    requested_note: checked.value.note,
    requested_show: checked.value.show_on_school_page,
  })
  if (error) return NextResponse.json({ error: 'STATUS_TAGS_NOT_SAVED' }, { status: error.message?.includes('ACCESS') ? 403 : 400, headers })
  return NextResponse.json({ status: data }, { headers })
}
