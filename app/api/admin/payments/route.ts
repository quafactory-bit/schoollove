import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { PaymentAdminOperationSchema } from '@/lib/policy/paymentOperations'
import { applyPaymentAdminOperation, getPaymentAdminState } from '@/lib/paymentOperations'

const headers = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  if (!(await requireAdminSession(request))) return NextResponse.json({ error: 'ADMIN_AUTH_REQUIRED' }, { status: 401, headers })
  const state = await getPaymentAdminState()
  return state ? NextResponse.json(state, { headers }) : NextResponse.json({ error: 'PAYMENT_STATE_UNAVAILABLE' }, { status: 500, headers })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdminSession(request))) return NextResponse.json({ error: 'ADMIN_AUTH_REQUIRED' }, { status: 401, headers })
  const parsed = PaymentAdminOperationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_PAYMENT_OPERATION' }, { status: 400, headers })
  const result = await applyPaymentAdminOperation(parsed.data)
  return result.error ? NextResponse.json({ error: 'PAYMENT_OPERATION_FAILED' }, { status: 409, headers }) : NextResponse.json({ applied: true, result: result.data }, { headers })
}
