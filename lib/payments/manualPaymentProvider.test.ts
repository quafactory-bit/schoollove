import { describe, expect, it } from 'vitest'
import { manualPaymentProvider } from './manualPaymentProvider'

const request = {
  orderId: crypto.randomUUID(), orderNumber: 'SL-20260729-ABCDEF123456', paymentId: 'slp_manual_123456',
  amountKrw: 50000, currency: 'KRW' as const, idempotencyKey: 'test-key-1234567890',
  successUrl: 'https://schoollove.kr/promote/operations/payment/success',
  failUrl: 'https://schoollove.kr/promote/operations/payment/fail', orderName: '스쿨러브아이 광고',
}

describe('manual PaymentProvider fallback', () => {
  it('keeps manual payment available without financial data', async () => {
    const result = await manualPaymentProvider.createPayment(request)
    expect(result).toMatchObject({ provider: 'manual', paymentId: request.paymentId, providerReference: `manual:${request.orderNumber}`, status: 'awaiting_manual_transfer', amountKrw: 50000 })
    expect(JSON.stringify(result)).not.toMatch(/account|card|bank/i)
  })

  it('never accepts a webhook', async () => {
    expect(await manualPaymentProvider.verifyWebhookSignature()).toBe(false)
    await expect(manualPaymentProvider.parseWebhook('{}', {})).rejects.toThrow('MANUAL_PROVIDER_WEBHOOK_DISABLED')
  })
})
