import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getPaymentProvider } from '@/lib/payments/providerFactory'
import { createPaymentCallbackState, verifyPaymentCallbackState } from '@/lib/payments/paymentCallback'
import type { PaymentAdminOperation, PaymentCreateSchema } from '@/lib/policy/paymentOperations'
import type { z } from 'zod'

type CreateInput = z.infer<typeof PaymentCreateSchema>
const hash = (value: string) => createHash('sha256').update(value.normalize('NFKC').trim()).digest('hex')
const publicOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3210').replace(/\/$/, '')
const safeErrorCode = (error: unknown) => error instanceof Error && /^[A-Z0-9_]{2,60}$/.test(error.message) ? error.message : 'PAYMENT_PROVIDER_ERROR'

export async function createOwnerPayment(userId: string, input: CreateInput) {
  if (process.env.NODE_ENV === 'production' && input.provider !== 'portone_sandbox') return null
  const provider = getPaymentProvider(input.provider)
  if (!provider) return null
  const admin = getSupabaseAdmin()
  const paymentId = `slp_${randomBytes(18).toString('base64url')}`
  const { data, error } = await admin.rpc('create_payment_attempt', {
    actor_user_id: userId, target_order_id: input.order_id, requested_provider: input.provider,
    requested_payment_id: paymentId, request_key_hash: hash(input.idempotency_key),
  })
  const payment = Array.isArray(data) ? data[0] : data
  if (error || !payment) return null
  const result = await provider.createPayment({
    orderId: payment.order_id, orderNumber: payment.order_number, paymentId: payment.provider_payment_id,
    amountKrw: payment.amount_krw, currency: 'KRW', idempotencyKey: input.idempotency_key,
    successUrl: `${publicOrigin()}/promote/operations/payment`, failUrl: `${publicOrigin()}/promote/operations/payment`,
    orderName: `스쿨러브아이 광고 ${payment.order_number}`,
  })
  await admin.rpc('update_payment_attempt_status', {
    requested_provider: result.provider, requested_payment_id: result.paymentId, requested_status: result.status,
    requested_provider_reference: result.providerReference, requested_safe_error: null,
  })
  const callbackState = createPaymentCallbackState(payment.id, userId)
  const separator = result.checkoutUrl?.includes('?') ? '&' : '?'
  return { ...result, checkoutUrl: result.checkoutUrl ? `${result.checkoutUrl}${separator}state=${encodeURIComponent(callbackState)}` : undefined, paymentTransactionId: payment.id, callbackState }
}

export async function getOwnerPayments(userId: string, paymentId?: string) {
  const admin = getSupabaseAdmin()
  let query = admin.from('payment_transactions').select('id,order_id,provider,provider_payment_id,provider_reference,status,order_number,amount_krw,currency,receipt_reference,paid_at,created_at,updated_at,promotion_commercial_orders(product_snapshot)').eq('owner_user_id', userId).order('created_at', { ascending: false }).limit(100)
  if (paymentId) query = query.eq('provider_payment_id', paymentId)
  const { data, error } = await query
  return error ? null : data ?? []
}

export async function verifyOwnerPayment(userId: string, paymentId: string, callbackState: string) {
  const state = verifyPaymentCallbackState(callbackState, userId)
  if (!state) return { ok: false, code: 'INVALID_CALLBACK_STATE' } as const
  const admin = getSupabaseAdmin()
  const { data: payment } = await admin.from('payment_transactions').select('id,order_id,provider,provider_payment_id,amount_krw,currency').eq('id', state.paymentTransactionId).eq('provider_payment_id', paymentId).eq('owner_user_id', userId).maybeSingle()
  if (!payment) return { ok: false, code: 'PAYMENT_NOT_FOUND' } as const
  const provider = getPaymentProvider(payment.provider)
  if (!provider) return { ok: false, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' } as const
  try {
    const verified = await provider.verifyPayment(payment.provider_payment_id, { orderId: payment.order_id, amountKrw: payment.amount_krw, currency: payment.currency })
    if (verified.status === 'paid') {
      const { error } = await admin.rpc('confirm_verified_payment', {
        requested_provider: verified.provider, requested_payment_id: verified.paymentId,
        requested_provider_reference: verified.providerReference, verified_amount: verified.amountKrw,
        verified_currency: verified.currency, requested_receipt_reference: verified.receiptReference ?? null,
        requested_paid_at: verified.paidAt ?? new Date().toISOString(),
      })
      return error ? { ok: false, code: 'PAYMENT_STATE_CONFLICT' } as const : { ok: true, status: 'paid' } as const
    }
    await admin.rpc('update_payment_attempt_status', {
      requested_provider: verified.provider, requested_payment_id: verified.paymentId, requested_status: verified.status,
      requested_provider_reference: verified.providerReference, requested_safe_error: null,
    })
    return { ok: true, status: verified.status } as const
  } catch (error) {
    return { ok: false, code: safeErrorCode(error) } as const
  }
}

export async function processPaymentWebhook(providerName: 'portone_sandbox' | 'mock', rawBody: string, headers: Record<string,string|null>) {
  const provider = getPaymentProvider(providerName)
  if (!provider) return { status: 503, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' }
  if (!(await provider.verifyWebhookSignature(rawBody, headers))) return { status: 401, code: 'INVALID_WEBHOOK_SIGNATURE' }
  let webhook
  try { webhook = await provider.parseWebhook(rawBody, headers) } catch { return { status: 400, code: 'INVALID_WEBHOOK_PAYLOAD' } }
  if (!webhook) return { status: 200, code: 'IGNORED_EVENT' }
  const admin = getSupabaseAdmin()
  const { data: eventId, error: eventError } = await admin.rpc('register_payment_webhook_event', {
    requested_provider: providerName, requested_event_id: webhook.eventId, requested_event_type: webhook.eventType,
    requested_payment_id: webhook.paymentId, requested_payload_hash: hash(rawBody), requested_occurred_at: webhook.occurredAt,
  })
  if (eventError) return { status: 400, code: 'WEBHOOK_EVENT_REJECTED' }
  if (!eventId) return { status: 200, code: 'DUPLICATE_EVENT' }
  try {
    const { data: payment } = await admin.from('payment_transactions').select('id,order_id,amount_krw,currency').eq('provider', providerName).eq('provider_payment_id', webhook.paymentId).maybeSingle()
    if (!payment) {
      await admin.rpc('finish_payment_webhook_event', { target_event_id: eventId, requested_status: 'ignored', requested_error_code: 'PAYMENT_NOT_FOUND' })
      return { status: 200, code: 'PAYMENT_NOT_FOUND' }
    }
    const verified = await provider.verifyPayment(webhook.paymentId, { orderId: payment.order_id, amountKrw: payment.amount_krw, currency: payment.currency })
    if (verified.status === 'paid') {
      const { error } = await admin.rpc('confirm_verified_payment', { requested_provider: verified.provider, requested_payment_id: verified.paymentId, requested_provider_reference: verified.providerReference, verified_amount: verified.amountKrw, verified_currency: verified.currency, requested_receipt_reference: verified.receiptReference ?? null, requested_paid_at: verified.paidAt ?? webhook.occurredAt })
      if (error) throw new Error('PAYMENT_STATE_CONFLICT')
    } else if (['ready','pending','failed','cancelled','expired'].includes(verified.status)) {
      await admin.rpc('update_payment_attempt_status', { requested_provider: verified.provider, requested_payment_id: verified.paymentId, requested_status: verified.status, requested_provider_reference: verified.providerReference, requested_safe_error: null })
    }
    await admin.rpc('finish_payment_webhook_event', { target_event_id: eventId, requested_status: 'processed', requested_error_code: null })
    return { status: 200, code: 'PROCESSED' }
  } catch (error) {
    await admin.rpc('finish_payment_webhook_event', { target_event_id: eventId, requested_status: 'failed', requested_error_code: safeErrorCode(error) })
    return { status: 503, code: 'WEBHOOK_PROCESSING_FAILED' }
  }
}

export async function getPaymentAdminState() {
  const admin = getSupabaseAdmin()
  const [payments, events, refunds, documents] = await Promise.all([
    admin.from('payment_transactions').select('id,order_id,provider,provider_payment_id,status,order_number,amount_krw,currency,paid_at,created_at,updated_at').order('created_at', { ascending: false }).limit(200),
    admin.from('payment_webhook_events').select('id,provider,event_id,event_type,provider_payment_id,status,attempts,occurred_at,received_at,processed_at,next_attempt_at,safe_error_code').order('received_at', { ascending: false }).limit(200),
    admin.from('payment_refund_attempts').select('id,payment_transaction_id,provider,requested_amount_krw,completed_amount_krw,status,safe_error_code,requested_at,completed_at').order('requested_at', { ascending: false }).limit(200),
    admin.from('payment_document_requests').select('id,payment_transaction_id,document_type,status,requested_at,updated_at').order('requested_at', { ascending: false }).limit(200),
  ])
  if ([payments,events,refunds,documents].some((result) => result.error)) return null
  return { payments: payments.data ?? [], events: events.data ?? [], refunds: refunds.data ?? [], documents: documents.data ?? [], sandboxConfigured: Boolean(getPaymentProvider('portone_sandbox')) }
}

export async function applyPaymentAdminOperation(action: PaymentAdminOperation) {
  const admin = getSupabaseAdmin()
  if (action.action === 'retry_webhook') return admin.rpc('admin_retry_payment_webhook', { target_event_id: action.event_id, admin_actor: 'admin-session' })
  const { data: payment } = await admin.from('payment_transactions').select('provider,provider_payment_id,amount_krw').eq('provider_payment_id', action.payment_id).maybeSingle()
  if (!payment || action.amount_krw > payment.amount_krw) return { data: null, error: new Error('REFUND_UNAVAILABLE') }
  const provider = getPaymentProvider(payment.provider)
  if (!provider) return { data: null, error: new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') }
  try {
    const result = await provider.refundPayment({ paymentId: payment.provider_payment_id, amountKrw: action.amount_krw, reason: action.reason, idempotencyKey: action.idempotency_key })
    return admin.rpc('record_provider_refund', { requested_provider: payment.provider, requested_payment_id: payment.provider_payment_id, requested_amount: action.amount_krw, request_key_hash: hash(action.idempotency_key), requested_provider_reference: result.providerReference, requested_status: action.amount_krw === payment.amount_krw ? 'completed' : 'partial' })
  } catch (error) { return { data: null, error } }
}

export async function requestPaymentDocument(userId: string, paymentTransactionId: string, documentType: 'cash_receipt'|'tax_invoice', businessReference?: string) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.rpc('request_payment_document', { actor_user_id: userId, target_payment_id: paymentTransactionId, requested_type: documentType, business_ref_hash: businessReference ? hash(businessReference) : null })
  return error ? null : data
}
