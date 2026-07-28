import { describe, expect, it } from 'vitest'
import { manualPaymentProvider } from './manualPaymentProvider'

describe('manual PaymentProvider', () => {
  it('returns an opaque order reference without bank or card data', async () => {
    const result = await manualPaymentProvider.createPayment({ orderId: crypto.randomUUID(), orderNumber: 'SL-20260728-ABCDEF123456', amountKrw: 50000, idempotencyKey: 'test-key' })
    expect(result).toEqual({ provider: 'manual', providerReference: 'manual:SL-20260728-ABCDEF123456', status: 'awaiting_manual_transfer' })
    expect(JSON.stringify(result)).not.toMatch(/account|card|bank/i)
  })

  it('never accepts a webhook', async () => {
    await expect(manualPaymentProvider.handleWebhook({}, null)).rejects.toThrow('MANUAL_PROVIDER_WEBHOOK_DISABLED')
  })
})
