import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { PaymentDocumentSchema } from '@/lib/policy/paymentOperations'
import { requestPaymentDocument } from '@/lib/paymentOperations'

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'PAYMENT_ACCESS_REQUIRED' }, { status: 401, headers })
  if (!(await hasBetaFeatureAccess(auth.client, auth.user.id, 'promotion_operations'))) return NextResponse.json({ error: 'PAYMENT_ACCESS_REQUIRED' }, { status: 401, headers })
  const { data: adult } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (adult !== true) return NextResponse.json({ error: 'PAYMENT_ACCESS_REQUIRED' }, { status: 401, headers })
  const parsed = PaymentDocumentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_DOCUMENT_REQUEST' }, { status: 400, headers })
  const id = await requestPaymentDocument(auth.user.id, parsed.data.payment_transaction_id, parsed.data.document_type, parsed.data.business_reference)
  return id ? NextResponse.json({ requested: true, id }, { headers }) : NextResponse.json({ error: 'DOCUMENT_REQUEST_UNAVAILABLE' }, { status: 409, headers })
}
