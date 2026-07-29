import { manualPaymentProvider } from './manualPaymentProvider'
import { MockPaymentProvider } from './mockPaymentProvider'
import { getPortOneSandboxProvider } from './portOneSandboxProvider'
import type { PaymentProvider, PaymentProviderName } from './PaymentProvider'

let mockProvider: MockPaymentProvider | null = null

export function getPaymentProvider(name: PaymentProviderName): PaymentProvider | null {
  if (name === 'manual') return manualPaymentProvider
  if (name === 'mock') {
    if (process.env.NODE_ENV === 'production') return null
    mockProvider ??= new MockPaymentProvider(process.env.PAYMENT_MOCK_WEBHOOK_SECRET)
    return mockProvider
  }
  return getPortOneSandboxProvider()
}

export function isPaymentSandboxConfigured() {
  return Boolean(getPortOneSandboxProvider())
}
