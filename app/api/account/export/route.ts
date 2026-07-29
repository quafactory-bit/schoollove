import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { DataExportRequestSchema } from '@/lib/policy/operations'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const privateHeaders = { 'cache-control':'private, no-store' }

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers:privateHeaders })
  const { data, error } = await getSupabaseAdmin().from('data_export_jobs').select('id,format,status,requested_at,ready_at,expires_at,safe_error_code').eq('owner_user_id',auth.user.id).order('requested_at',{ascending:false}).limit(20)
  if (error) return NextResponse.json({ error: 'EXPORT_LIST_FAILED' }, { status: 500, headers:privateHeaders })
  return NextResponse.json({ exports: data }, { headers:privateHeaders })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers:privateHeaders })
  const parsed = DataExportRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400, headers:privateHeaders })
  const { data, error } = await getSupabaseAdmin().rpc('request_own_data_export', { actor_user_id: auth.user.id, requested_format: parsed.data.format })
  if (error) return NextResponse.json({ error: 'EXPORT_REQUEST_REJECTED' }, { status: 409, headers:privateHeaders })
  return NextResponse.json({ id: data, status: 'queued' }, { status: 202, headers:privateHeaders })
}
