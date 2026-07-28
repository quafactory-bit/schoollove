import type { PaymentProvider, PaymentRequest, PaymentResult } from './PaymentProvider'

function reference(orderNumber: string) {
  return `manual:${orderNumber}`
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual' as const

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    return { provider: this.name, providerReference: reference(request.orderNumber), status: 'awaiting_manual_transfer' }
  }

  async verifyPayment(providerReference: string, _idempotencyKey: string): Promise<PaymentResult> {
    return { provider: this.name, providerReference, status: 'manual_review_required' }
  }

  async cancelPayment(providerReference: string, _idempotencyKey: string): Promise<PaymentResult> {
    return { provider: this.name, providerReference, status: 'cancelled' }
  }

  async handleWebhook(_payload: unknown, _signature: string | null): Promise<never> {
    throw new Error('MANUAL_PROVIDER_WEBHOOK_DISABLED')
  }
}

export const manualPaymentProvider = new ManualPaymentProvider()
