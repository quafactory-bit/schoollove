import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { checkPromotionRateLimit, getPromotionRequestIp } from '@/lib/security/promotionRateLimit'
import { PaymentCreateSchema } from '@/lib/policy/paymentOperations'
import { createOwnerPayment, getOwnerPayments } from '@/lib/paymentOperations'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

async function ownerContext(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return null
  if (!(await hasBetaFeatureAccess(auth.client, auth.user.id, 'promotion_operations'))) return null
  const { data: adult } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  return adult === true ? auth : null
}

export async function GET(request: NextRequest) {
  const auth = await ownerContext(request)
  if (!auth) return NextResponse.json({ error: 'PAYMENT_ACCESS_REQUIRED' }, { status: 401, headers: privateHeaders })
  const paymentId = request.nextUrl.searchParams.get('paymentId') ?? undefined
  if (paymentId && !/^[A-Za-z0-9_-]{6,64}$/.test(paymentId)) return NextResponse.json({ error: 'INVALID_PAYMENT_ID' }, { status: 400, headers: privateHeaders })
  const data = await getOwnerPayments(auth.user.id, paymentId)
  return data ? NextResponse.json({ payments: data }, { headers: privateHeaders }) : NextResponse.json({ error: 'PAYMENT_STATE_UNAVAILABLE' }, { status: 500, headers: privateHeaders })
}

export async function POST(request: NextRequest) {
  const auth = await ownerContext(request)
  if (!auth) return NextResponse.json({ error: 'PAYMENT_ACCESS_REQUIRED' }, { status: 401, headers: privateHeaders })
  const rate = await checkPromotionRateLimit({ ip: getPromotionRequestIp(request), userId: auth.user.id, action: 'request' })
  if (!rate.allowed) return NextResponse.json({ error: 'PAYMENT_RATE_LIMITED' }, { status: rate.status, headers: { ...privateHeaders, ...(rate.retryAfter ? { 'Retry-After': String(rate.retryAfter) } : {}) } })
  const parsed = PaymentCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_PAYMENT_REQUEST' }, { status: 400, headers: privateHeaders })
  try {
    const payment = await createOwnerPayment(auth.user.id, parsed.data)
    return payment ? NextResponse.json(payment, { status: 201, headers: privateHeaders }) : NextResponse.json({ error: 'PAYMENT_PROVIDER_UNAVAILABLE' }, { status: 503, headers: privateHeaders })
  } catch {
    return NextResponse.json({ error: 'PAYMENT_CREATE_FAILED' }, { status: 409, headers: privateHeaders })
  }
}
