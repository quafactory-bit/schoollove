import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from '@/lib/admin-auth'
import { runMaintenance } from '@/lib/operations'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!secret || !timingSafeEqual(supplied, secret)) return NextResponse.json({ error: 'CRON_AUTH_REQUIRED' }, { status: 401 })
  const now = new Date()
  const runKey = `phase10f:${now.toISOString().slice(0,10)}`
  try { return NextResponse.json({ ok: true, result: await runMaintenance(runKey, now.toISOString()) }) }
  catch { return NextResponse.json({ ok: false, error: 'MAINTENANCE_FAILED' }, { status: 500 }) }
}
