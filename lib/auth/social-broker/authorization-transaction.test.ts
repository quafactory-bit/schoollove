import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { downstreamAuthorizationTransactionHandleDigest, prepareDownstreamAuthorizationTransaction } from './authorization-transaction'

const input = { loginAttemptId: '10000000-0000-4000-8000-000000000001', clientId: 'slb-supabase-google', redirectUri: 'https://example.invalid/callback', scopes: ['openid', 'openid', 'profile'], pkceS256Challenge: 'A'.repeat(43), downstreamNonce: 'nonce-value', downstreamState: 'state-value', now: 1_800_000_000, expiresAt: 1_800_000_600, transactionId: '10000000-0000-4000-8000-000000000002', brokerHandle: 'B'.repeat(43) } as const

describe('downstream authorization transaction preparation', () => {
  it('freezes a normalized request while keeping the broker handle out of its DB payload', () => {
    const prepared = prepareDownstreamAuthorizationTransaction(input)
    expect(prepared.database.requestedScopes).toBe('openid profile')
    expect(Buffer.from(prepared.database.brokerHandleDigest)).toEqual(Buffer.from(downstreamAuthorizationTransactionHandleDigest(input.brokerHandle)))
    expect(JSON.stringify(prepared.database)).not.toContain(input.brokerHandle)
    expect(prepared.correlation.brokerHandle).toHaveLength(43)
  })

  it('rejects non-S256-shaped challenge, non-UUID trusted IDs, and malformed handles', () => {
    expect(() => prepareDownstreamAuthorizationTransaction({ ...input, pkceS256Challenge: 'plain' })).toThrow('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
    expect(() => prepareDownstreamAuthorizationTransaction({ ...input, loginAttemptId: 'browser-id' })).toThrow('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
    expect(() => downstreamAuthorizationTransactionHandleDigest('short')).toThrow('DOWNSTREAM_AUTHORIZATION_HANDLE_INVALID')
  })
})
