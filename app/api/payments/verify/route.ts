import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { PaymentVerifySchema } from '@/lib/policy/paymentOperations'
import { verifyOwnerPayment } from '@/lib/paymentOperations'

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'PAYMENT_ACCESS_REQUIRED' }, { status: 401, headers })
  if (!(await hasBetaFeatureAccess(auth.client, auth.user.id, 'promotion_operations'))) return NextResponse.json({ error: 'PAYMENT_ACCESS_REQUIRED' }, { status: 401, headers })
  const { data: adult } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (adult !== true) return NextResponse.json({ error: 'PAYMENT_ACCESS_REQUIRED' }, { status: 401, headers })
  const parsed = PaymentVerifySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_PAYMENT_CALLBACK' }, { status: 400, headers })
  try {
    const result = await verifyOwnerPayment(auth.user.id, parsed.data.payment_id, parsed.data.callback_state)
    return NextResponse.json(result, { status: result.ok ? 200 : 409, headers })
  } catch {
    return NextResponse.json({ ok: false, code: 'PAYMENT_VERIFICATION_FAILED' }, { status: 503, headers })
  }
}
