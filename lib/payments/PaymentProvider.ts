export type PaymentProviderName = 'manual' | 'mock' | 'portone_sandbox'

export type PaymentStatus =
  | 'created'
  | 'ready'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded'
  | 'expired'
  | 'awaiting_manual_transfer'
  | 'manual_review_required'

export type PaymentRequest = {
  orderId: string
  orderNumber: string
  paymentId: string
  amountKrw: number
  currency: 'KRW'
  idempotencyKey: string
  successUrl: string
  failUrl: string
  orderName: string
}

export type PaymentResult = {
  provider: PaymentProviderName
  paymentId: string
  providerReference: string
  status: PaymentStatus
  amountKrw: number
  currency: 'KRW'
  checkoutUrl?: string
  receiptReference?: string | null
  paidAt?: string | null
}

export type PaymentRefundRequest = {
  paymentId: string
  amountKrw: number
  reason: string
  idempotencyKey: string
}

export type PaymentWebhookHeaders = Record<string, string | null | undefined>

export type ParsedPaymentWebhook = {
  eventId: string
  eventType: string
  paymentId: string
  occurredAt: string
  providerReference?: string | null
}

export interface PaymentProvider {
  readonly name: PaymentProviderName
  createPayment(request: PaymentRequest): Promise<PaymentResult>
  getPayment(paymentId: string): Promise<PaymentResult>
  verifyPayment(paymentId: string, expected: Pick<PaymentRequest, 'orderId' | 'amountKrw' | 'currency'>): Promise<PaymentResult>
  cancelPayment(paymentId: string, idempotencyKey: string): Promise<PaymentResult>
  refundPayment(request: PaymentRefundRequest): Promise<PaymentResult>
  parseWebhook(rawBody: string, headers: PaymentWebhookHeaders): Promise<ParsedPaymentWebhook | null>
  verifyWebhookSignature(rawBody: string, headers: PaymentWebhookHeaders): Promise<boolean>
  getReceiptReference(paymentId: string): Promise<string | null>
}
