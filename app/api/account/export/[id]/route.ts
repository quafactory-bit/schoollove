import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { buildOwnerExport, ownerExportCsv } from '@/lib/dataExport'

export const dynamic = 'force-dynamic'
const privateHeaders = { 'cache-control':'private, no-store' }

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers:privateHeaders })
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'INVALID_EXPORT' }, { status: 400, headers:privateHeaders })
  const { data: job, error } = await getSupabaseAdmin().from('data_export_jobs').select('format,status,expires_at').eq('id',id).eq('owner_user_id',auth.user.id).maybeSingle()
  if (error || !job) return NextResponse.json({ error: 'EXPORT_NOT_FOUND' }, { status: 404, headers:privateHeaders })
  if (job.status !== 'ready' || !job.expires_at || new Date(job.expires_at) <= new Date()) return NextResponse.json({ error: 'EXPORT_NOT_READY' }, { status: 409, headers:privateHeaders })
  try {
    const payload = await buildOwnerExport(auth.user.id)
    if (job.format === 'csv') return new NextResponse(ownerExportCsv(payload), { headers: { 'content-type':'text/csv; charset=utf-8', 'content-disposition':`attachment; filename="schoollove-export-${id}.csv"`, 'cache-control':'private, no-store' } })
    return new NextResponse(JSON.stringify(payload,null,2), { headers: { 'content-type':'application/json; charset=utf-8', 'content-disposition':`attachment; filename="schoollove-export-${id}.json"`, 'cache-control':'private, no-store' } })
  } catch { return NextResponse.json({ error: 'EXPORT_BUILD_FAILED' }, { status: 500, headers:privateHeaders }) }
}
