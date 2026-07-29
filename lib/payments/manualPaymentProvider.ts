import type { ParsedPaymentWebhook, PaymentProvider, PaymentRefundRequest, PaymentRequest, PaymentResult, PaymentWebhookHeaders } from './PaymentProvider'

function result(paymentId: string, providerReference: string, status: PaymentResult['status']): PaymentResult {
  return { provider: 'manual', paymentId, providerReference, status, amountKrw: 0, currency: 'KRW' }
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual' as const

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    return { ...result(request.paymentId, `manual:${request.orderNumber}`, 'awaiting_manual_transfer'), amountKrw: request.amountKrw }
  }

  async getPayment(paymentId: string): Promise<PaymentResult> {
    return result(paymentId, `manual:${paymentId}`, 'manual_review_required')
  }

  async verifyPayment(paymentId: string): Promise<PaymentResult> {
    return result(paymentId, `manual:${paymentId}`, 'manual_review_required')
  }

  async cancelPayment(paymentId: string): Promise<PaymentResult> {
    return result(paymentId, `manual:${paymentId}`, 'cancelled')
  }

  async refundPayment(request: PaymentRefundRequest): Promise<PaymentResult> {
    return result(request.paymentId, `manual:${request.paymentId}`, 'manual_review_required')
  }

  async parseWebhook(_rawBody: string, _headers: PaymentWebhookHeaders): Promise<ParsedPaymentWebhook | null> {
    throw new Error('MANUAL_PROVIDER_WEBHOOK_DISABLED')
  }

  async verifyWebhookSignature(): Promise<boolean> {
    return false
  }

  async getReceiptReference(): Promise<string | null> {
    return null
  }
}

export const manualPaymentProvider = new ManualPaymentProvider()
