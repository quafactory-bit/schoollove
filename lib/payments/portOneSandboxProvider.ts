import type { ParsedPaymentWebhook, PaymentProvider, PaymentRefundRequest, PaymentRequest, PaymentResult, PaymentStatus, PaymentWebhookHeaders } from './PaymentProvider'
import { ALLOWED_EVENTS } from './mockPaymentProvider'
import { getStandardWebhookId, verifyStandardWebhook } from './standardWebhook'

const API_BASE = 'https://api.portone.io'

type PortOnePayment = {
  id?: unknown
  status?: unknown
  amount?: { total?: unknown; currency?: unknown }
  paidAt?: unknown
  transactionId?: unknown
  receiptUrl?: unknown
}

type Config = {
  apiSecret: string
  webhookSecret: string
  storeId: string
  channelKey: string
  fetchImpl?: typeof fetch
}

function safeSandboxValue(value: string, name: string) {
  if (!value || /live[_-]/i.test(value)) throw new Error(`${name}_SANDBOX_REQUIRED`)
  return value
}

function statusOf(value: unknown): PaymentStatus {
  if (value === 'PAID') return 'paid'
  if (value === 'FAILED') return 'failed'
  if (value === 'CANCELLED') return 'refunded'
  if (value === 'PARTIAL_CANCELLED') return 'partially_refunded'
  if (value === 'READY') return 'ready'
  if (value === 'PENDING' || value === 'VIRTUAL_ACCOUNT_ISSUED' || value === 'PAY_PENDING') return 'pending'
  return 'created'
}

export class PortOneSandboxPaymentProvider implements PaymentProvider {
  readonly name = 'portone_sandbox' as const
  readonly storeId: string
  readonly channelKey: string
  private readonly apiSecret: string
  private readonly webhookSecret: string
  private readonly fetchImpl: typeof fetch

  constructor(config: Config) {
    this.apiSecret = safeSandboxValue(config.apiSecret, 'PORTONE_API_SECRET')
    this.webhookSecret = safeSandboxValue(config.webhookSecret, 'PORTONE_WEBHOOK_SECRET')
    this.storeId = safeSandboxValue(config.storeId, 'PORTONE_STORE_ID')
    this.channelKey = safeSandboxValue(config.channelKey, 'PORTONE_CHANNEL_KEY')
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    return {
      provider: this.name, paymentId: request.paymentId, providerReference: request.paymentId,
      status: 'ready', amountKrw: request.amountKrw, currency: request.currency,
      checkoutUrl: `/promote/operations/payment?paymentId=${encodeURIComponent(request.paymentId)}`,
    }
  }

  async getPayment(paymentId: string): Promise<PaymentResult> {
    return this.fetchPayment(paymentId)
  }

  async verifyPayment(paymentId: string, expected: Pick<PaymentRequest, 'amountKrw' | 'currency'>): Promise<PaymentResult> {
    const payment = await this.fetchPayment(paymentId)
    if (payment.amountKrw !== expected.amountKrw || payment.currency !== expected.currency) throw new Error('PAYMENT_MISMATCH')
    return payment
  }

  async cancelPayment(paymentId: string, idempotencyKey: string): Promise<PaymentResult> {
    const payment = await this.getPayment(paymentId)
    return this.cancel(paymentId, payment.amountKrw, 'buyer_cancelled', idempotencyKey)
  }

  async refundPayment(request: PaymentRefundRequest): Promise<PaymentResult> {
    return this.cancel(request.paymentId, request.amountKrw, request.reason, request.idempotencyKey)
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
    const payment = await this.fetchJson(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' }) as PortOnePayment
    return typeof payment.receiptUrl === 'string' ? payment.receiptUrl : null
  }

  private async fetchPayment(paymentId: string): Promise<PaymentResult> {
    const value = await this.fetchJson(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' }) as PortOnePayment
    const amount = value.amount?.total
    const currency = value.amount?.currency
    if (typeof value.id !== 'string' || typeof amount !== 'number' || currency !== 'KRW') throw new Error('INVALID_PROVIDER_RESPONSE')
    return {
      provider: this.name, paymentId: value.id,
      providerReference: typeof value.transactionId === 'string' ? value.transactionId : value.id,
      status: statusOf(value.status), amountKrw: amount, currency,
      receiptReference: typeof value.receiptUrl === 'string' ? value.receiptUrl : null,
      paidAt: typeof value.paidAt === 'string' ? value.paidAt : null,
    }
  }

  private async cancel(paymentId: string, amountKrw: number, reason: string, idempotencyKey: string) {
    await this.fetchJson(`/payments/${encodeURIComponent(paymentId)}/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ storeId: this.storeId, amount: amountKrw, reason: reason.slice(0, 200) }),
    })
    return this.fetchPayment(paymentId)
  }

  private async fetchJson(path: string, init: RequestInit) {
    const response = await this.fetchImpl(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `PortOne ${this.apiSecret}`, Accept: 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`PORTONE_API_${response.status}`)
    return response.json()
  }
}

export function getPortOneSandboxProvider() {
  const apiSecret = process.env.PORTONE_SANDBOX_API_SECRET
  const webhookSecret = process.env.PORTONE_SANDBOX_WEBHOOK_SECRET
  const storeId = process.env.NEXT_PUBLIC_PORTONE_SANDBOX_STORE_ID
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_SANDBOX_CHANNEL_KEY
  if (!apiSecret || !webhookSecret || !storeId || !channelKey) return null
  return new PortOneSandboxPaymentProvider({ apiSecret, webhookSecret, storeId, channelKey })
}
