export type PaymentRequest = {
  orderId: string
  orderNumber: string
  amountKrw: number
  idempotencyKey: string
}

export type PaymentResult = {
  provider: 'manual'
  providerReference: string
  status: 'awaiting_manual_transfer' | 'manual_review_required' | 'cancelled'
}

export interface PaymentProvider {
  readonly name: 'manual'
  createPayment(request: PaymentRequest): Promise<PaymentResult>
  verifyPayment(providerReference: string, idempotencyKey: string): Promise<PaymentResult>
  cancelPayment(providerReference: string, idempotencyKey: string): Promise<PaymentResult>
  handleWebhook(payload: unknown, signature: string | null): Promise<never>
}
