import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { MockPaymentProvider } from './mockPaymentProvider'
import { PortOneSandboxPaymentProvider } from './portOneSandboxProvider'
import { signStandardWebhook, verifyStandardWebhook } from './standardWebhook'

const base = {
  orderId: crypto.randomUUID(), orderNumber: 'SL-20260729-ABCDEF123456', paymentId: 'slp_test_123456',
  amountKrw: 50000, currency: 'KRW' as const, idempotencyKey: 'idem-1234567890123456',
  successUrl: 'https://schoollove.kr/promote/operations/payment/success',
  failUrl: 'https://schoollove.kr/promote/operations/payment/fail', orderName: '스쿨러브아이 광고',
}

describe('mock payment lifecycle', () => {
  it('is idempotent, verifies server amount and supports partial/full refunds', async () => {
    const provider = new MockPaymentProvider()
    const first = await provider.createPayment(base)
    const duplicate = await provider.createPayment(base)
    expect(duplicate.providerReference).toBe(first.providerReference)
    provider.setStatus(base.paymentId, 'paid')
    await expect(provider.verifyPayment(base.paymentId, { orderId: base.orderId, amountKrw: 50001, currency: 'KRW' })).rejects.toThrow('PAYMENT_MISMATCH')
    expect((await provider.verifyPayment(base.paymentId, base)).status).toBe('paid')
    expect((await provider.refundPayment({ paymentId: base.paymentId, amountKrw: 10000, reason: 'partial', idempotencyKey: 'refund-1234567890123456' })).status).toBe('partially_refunded')
    expect((await provider.refundPayment({ paymentId: base.paymentId, amountKrw: 50000, reason: 'full', idempotencyKey: 'refund-2234567890123456' })).status).toBe('refunded')
  })
})

describe('Standard Webhooks boundary', () => {
  it('verifies the raw body in constant-time compatible form and rejects stale/tampered messages', () => {
    const secret = `whsec_${Buffer.from('01234567890123456789012345678901').toString('base64')}`
    const timestamp = `${Math.floor(Date.now() / 1000)}`
    const body = JSON.stringify({ type: 'Transaction.Paid', timestamp: new Date().toISOString(), data: { paymentId: base.paymentId } })
    const headers = { 'webhook-id': 'msg_test_123', 'webhook-timestamp': timestamp, 'webhook-signature': '' }
    headers['webhook-signature'] = `v1,${signStandardWebhook(body, headers, secret)}`
    expect(verifyStandardWebhook(body, headers, secret)).toBe(true)
    expect(verifyStandardWebhook(`${body} `, headers, secret)).toBe(false)
    expect(verifyStandardWebhook(body, { ...headers, 'webhook-timestamp': '1000000000' }, secret)).toBe(false)
  })
})

describe('PortOne sandbox adapter', () => {
  it('maps verified provider responses and never accepts a live credential', async () => {
    expect(() => new PortOneSandboxPaymentProvider({ apiSecret: 'live_secret', webhookSecret: 'test', storeId: 'store', channelKey: 'channel' })).toThrow('SANDBOX_REQUIRED')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: base.paymentId, status: 'PAID', amount: { total: 50000, currency: 'KRW' }, transactionId: 'tx_test', paidAt: '2026-07-29T00:00:00Z', receiptUrl: 'https://receipt.example.test/opaque' }), { status: 200 })) as unknown as typeof fetch
    const provider = new PortOneSandboxPaymentProvider({ apiSecret: 'test_api_secret', webhookSecret: 'whsec_d2ViaG9vay10ZXN0LXNlY3JldC0wMTIzNDU2Nzg5', storeId: 'store-test', channelKey: 'channel-test', fetchImpl })
    expect((await provider.verifyPayment(base.paymentId, base)).status).toBe('paid')
    await expect(provider.verifyPayment(base.paymentId, { ...base, amountKrw: 1 })).rejects.toThrow('PAYMENT_MISMATCH')
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent(base.paymentId)), expect.objectContaining({ method: 'GET' }))
  })

  it('does not log or serialize credentials into a provider response', async () => {
    const secret = 'test_api_secret_very_private'
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: base.paymentId, status: 'READY', amount: { total: 50000, currency: 'KRW' } }), { status: 200 })) as unknown as typeof fetch
    const provider = new PortOneSandboxPaymentProvider({ apiSecret: secret, webhookSecret: 'whsec_d2ViaG9vay10ZXN0LXNlY3JldC0wMTIzNDU2Nzg5', storeId: 'store-test', channelKey: 'channel-test', fetchImpl })
    expect(JSON.stringify(await provider.getPayment(base.paymentId))).not.toContain(secret)
  })
})
