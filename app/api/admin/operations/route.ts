import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { BetaAdminOperationSchema } from '@/lib/policy/operations'
import { applyBetaAdminOperation } from '@/lib/operations'
import { getBetaAdminState } from '@/lib/beta'

export async function GET(request: NextRequest) {
  if (!(await requireAdminSession(request))) return NextResponse.json({ error: 'ADMIN_AUTH_REQUIRED' }, { status: 401 })
  try { return NextResponse.json(await getBetaAdminState()) }
  catch { return NextResponse.json({ error: 'OPERATIONS_STATE_UNAVAILABLE' }, { status: 500 }) }
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdminSession(request))) return NextResponse.json({ error: 'ADMIN_AUTH_REQUIRED' }, { status: 401 })
  const parsed = BetaAdminOperationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_OPERATION' }, { status: 400 })
  try { return NextResponse.json(await applyBetaAdminOperation(parsed.data)) }
  catch { return NextResponse.json({ error: 'OPERATION_REJECTED' }, { status: 409 }) }
}
