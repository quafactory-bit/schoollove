import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { createPaymentCallbackState, verifyPaymentCallbackState } from './paymentCallback'

describe('signed payment callback state', () => {
  beforeEach(() => { process.env.PAYMENT_CALLBACK_SECRET = 'local-test-callback-secret-0123456789abcdef' })

  it('binds state to the payment transaction, user and expiration', () => {
    const paymentId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const token = createPaymentCallbackState(paymentId, userId, 1_000_000)
    expect(verifyPaymentCallbackState(token, userId, 1_000_100)).toMatchObject({ paymentTransactionId: paymentId, userId })
    expect(verifyPaymentCallbackState(token, crypto.randomUUID(), 1_000_100)).toBeNull()
    expect(verifyPaymentCallbackState(`${token}x`, userId, 1_000_100)).toBeNull()
    expect(verifyPaymentCallbackState(token, userId, 1_901_000)).toBeNull()
  })

  it('fails closed when the callback secret is missing', () => {
    delete process.env.PAYMENT_CALLBACK_SECRET
    expect(() => createPaymentCallbackState(crypto.randomUUID(), crypto.randomUUID())).toThrow('PAYMENT_CALLBACK_NOT_CONFIGURED')
  })
})
