import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!(await requireAdminSession(request))) return NextResponse.json({ error: 'ADMIN_AUTH_REQUIRED' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const [lastRun, queuedExports, pendingOutbox, criticalIncidents] = await Promise.all([
    admin.from('operational_job_runs').select('status,started_at,finished_at,safe_error_code').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('data_export_jobs').select('*', { count: 'exact', head: true }).eq('status','queued'),
    admin.from('promotion_notification_outbox').select('*', { count: 'exact', head: true }).in('status',['pending','failed']),
    admin.from('operational_incidents').select('*', { count: 'exact', head: true }).eq('severity','critical').neq('status','resolved'),
  ])
  if (lastRun.error || queuedExports.error || pendingOutbox.error || criticalIncidents.error) return NextResponse.json({ status: 'degraded' }, { status: 503 })
  return NextResponse.json({ status: criticalIncidents.count ? 'degraded' : 'ok', lastRun: lastRun.data ?? null, queues: { exports: queuedExports.count ?? 0, notifications: pendingOutbox.count ?? 0 }, criticalIncidents: criticalIncidents.count ?? 0 })
}
