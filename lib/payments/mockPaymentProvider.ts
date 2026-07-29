import { randomUUID } from 'node:crypto'
import type { ParsedPaymentWebhook, PaymentProvider, PaymentRefundRequest, PaymentRequest, PaymentResult, PaymentStatus, PaymentWebhookHeaders } from './PaymentProvider'
import { getStandardWebhookId, verifyStandardWebhook } from './standardWebhook'

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const
  private readonly records = new Map<string, PaymentResult & { orderId: string }>()

  constructor(private readonly webhookSecret = 'whsec_bG9jYWwtbW9jay13ZWJob29rLXNlY3JldC1vbmx5') {}

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    const existing = this.records.get(request.paymentId)
    if (existing) return existing
    const created = {
      provider: this.name,
      paymentId: request.paymentId,
      providerReference: `mock:${randomUUID()}`,
      status: 'ready' as const,
      amountKrw: request.amountKrw,
      currency: request.currency,
      checkoutUrl: `/api/payments/mock/checkout?paymentId=${encodeURIComponent(request.paymentId)}`,
      orderId: request.orderId,
    }
    this.records.set(request.paymentId, created)
    return created
  }

  async getPayment(paymentId: string): Promise<PaymentResult> {
    const value = this.records.get(paymentId)
    if (!value) throw new Error('PAYMENT_NOT_FOUND')
    return value
  }

  async verifyPayment(paymentId: string, expected: Pick<PaymentRequest, 'orderId' | 'amountKrw' | 'currency'>): Promise<PaymentResult> {
    const value = this.records.get(paymentId)
    if (!value || value.orderId !== expected.orderId || value.amountKrw !== expected.amountKrw || value.currency !== expected.currency) throw new Error('PAYMENT_MISMATCH')
    return value
  }

  async cancelPayment(paymentId: string): Promise<PaymentResult> {
    return this.transition(paymentId, 'cancelled')
  }

  async refundPayment(request: PaymentRefundRequest): Promise<PaymentResult> {
    const value = this.records.get(request.paymentId)
    if (!value || request.amountKrw < 1 || request.amountKrw > value.amountKrw) throw new Error('INVALID_REFUND_AMOUNT')
    return this.transition(request.paymentId, request.amountKrw === value.amountKrw ? 'refunded' : 'partially_refunded')
  }

  async parseWebhook(rawBody: string, headers: PaymentWebhookHeaders): Promise<ParsedPaymentWebhook | null> {
    const parsed = JSON.parse(rawBody) as { type?: unknown; timestamp?: unknown; data?: { paymentId?: unknown; transactionId?: unknown } }
    if (typeof parsed.type !== 'string' || !ALLOWED_EVENTS.has(parsed.type)) return null
    if (typeof parsed.timestamp !== 'string' || typeof parsed.data?.paymentId !== 'string') throw new Error('INVALID_WEBHOOK_PAYLOAD')
    return { eventId: getStandardWebhookId(headers) ?? '', eventType: parsed.type, paymentId: parsed.data.paymentId, occurredAt: parsed.timestamp, providerReference: typeof parsed.data.transactionId === 'string' ? parsed.data.transactionId : null }
  }

  async verifyWebhookSignature(rawBody: string, headers: PaymentWebhookHeaders): Promise<boolean> {
    return verifyStandardWebhook(rawBody, headers, this.webhookSecret)
  }

  async getReceiptReference(paymentId: string): Promise<string | null> {
    const value = this.records.get(paymentId)
    return value?.status === 'paid' ? `mock-receipt:${paymentId}` : null
  }

  setStatus(paymentId: string, status: PaymentStatus) {
    return this.transition(paymentId, status)
  }

  private transition(paymentId: string, status: PaymentStatus) {
    const value = this.records.get(paymentId)
    if (!value) throw new Error('PAYMENT_NOT_FOUND')
    const next = { ...value, status, receiptReference: status === 'paid' ? `mock-receipt:${paymentId}` : value.receiptReference, paidAt: status === 'paid' ? new Date().toISOString() : value.paidAt }
    this.records.set(paymentId, next)
    return next
  }
}

export const ALLOWED_EVENTS = new Set([
  'Transaction.Ready', 'Transaction.Paid', 'Transaction.VirtualAccountIssued',
  'Transaction.PartialCancelled', 'Transaction.Cancelled', 'Transaction.Failed',
  'Transaction.PayPending', 'Transaction.CancelPending',
])
