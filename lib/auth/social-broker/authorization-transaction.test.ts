import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { downstreamAuthorizationBoundHandleDigest, downstreamAuthorizationTransactionHandleDigest, prepareBrowserBoundDownstreamAuthorizationTransaction, prepareDownstreamAuthorizationTransaction } from './authorization-transaction'

const input = { loginAttemptId: '10000000-0000-4000-8000-000000000001', clientId: 'slb-supabase-google', redirectUri: 'https://example.invalid/callback', scopes: ['openid', 'openid', 'profile'], pkceS256Challenge: 'A'.repeat(43), downstreamNonce: 'nonce-value', downstreamState: 'state-value', now: 1_800_000_000, expiresAt: 1_800_000_600, transactionId: '10000000-0000-4000-8000-000000000002', brokerHandle: 'B'.repeat(43) } as const

describe('downstream authorization transaction preparation', () => {
  it('freezes a normalized request while keeping the broker handle out of its DB payload', () => {
    const prepared = prepareDownstreamAuthorizationTransaction(input)
    expect(prepared.database.requestedScopes).toBe('openid profile')
    expect(Buffer.from(prepared.database.brokerHandleDigest)).toEqual(Buffer.from(downstreamAuthorizationTransactionHandleDigest(input.brokerHandle)))
    expect(JSON.stringify(prepared.database)).not.toContain(input.brokerHandle)
    expect(prepared.correlation.brokerHandle).toHaveLength(43)
  })

  it.each([
    'https://example.invalid',
    'https://example.invalid:443/callback',
    'https://example.invalid/callback?channel=broker&ui=dark',
  ])('preserves the registered, exact redirect URI without URL serialization: %s', (registeredRedirectUri) => {
    // The HTTP issuer performs the registered-client exact comparison before this
    // layer. This boundary must freeze that exact value, not choose a new one.
    const authorizationRequestRedirectUri = registeredRedirectUri
    const prepared = prepareDownstreamAuthorizationTransaction({ ...input, redirectUri: authorizationRequestRedirectUri })

    expect(authorizationRequestRedirectUri).toBe(registeredRedirectUri)
    expect(prepared.database.redirectUri).toBe(registeredRedirectUri)
  })

  it('rejects non-S256-shaped challenge, non-UUID trusted IDs, and malformed handles', () => {
    expect(() => prepareDownstreamAuthorizationTransaction({ ...input, pkceS256Challenge: 'plain' })).toThrow('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
    expect(() => prepareDownstreamAuthorizationTransaction({ ...input, loginAttemptId: 'browser-id' })).toThrow('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
    expect(() => prepareDownstreamAuthorizationTransaction({ ...input, redirectUri: 'not a URI' })).toThrow('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
    expect(() => downstreamAuthorizationTransactionHandleDigest('short')).toThrow('DOWNSTREAM_AUTHORIZATION_HANDLE_INVALID')
  })

  it('PHASE10O_Q_BROWSER_BOUND_HANDLE_DIGEST_FAILS_CLOSED_AND_IS_DOMAIN_SEPARATE', () => {
    const bindingA = 'C'.repeat(43); const bindingB = 'D'.repeat(43); const handleB = 'E'.repeat(43)
    const same = downstreamAuthorizationBoundHandleDigest(input.brokerHandle, bindingA)
    expect(Buffer.from(same)).toEqual(Buffer.from(downstreamAuthorizationBoundHandleDigest(input.brokerHandle, bindingA)))
    expect(Buffer.from(same)).not.toEqual(Buffer.from(downstreamAuthorizationBoundHandleDigest(input.brokerHandle, bindingB)))
    expect(Buffer.from(same)).not.toEqual(Buffer.from(downstreamAuthorizationBoundHandleDigest(handleB, bindingA)))
    expect(Buffer.from(same)).not.toEqual(Buffer.from(downstreamAuthorizationTransactionHandleDigest(input.brokerHandle)))
    expect(same).toHaveLength(32)
    expect(() => downstreamAuthorizationBoundHandleDigest('short', bindingA)).toThrow('DOWNSTREAM_AUTHORIZATION_BROWSER_BINDING_INVALID')
    expect(() => downstreamAuthorizationBoundHandleDigest(input.brokerHandle, 'short')).toThrow('DOWNSTREAM_AUTHORIZATION_BROWSER_BINDING_INVALID')
  })

  it('keeps browser continuation separate from the database payload', () => {
    const prepared = prepareBrowserBoundDownstreamAuthorizationTransaction({ ...input, browserBindingSecret: 'C'.repeat(43) })
    expect(Buffer.from(prepared.database.brokerHandleDigest)).toEqual(Buffer.from(downstreamAuthorizationBoundHandleDigest(input.brokerHandle, 'C'.repeat(43))))
    expect(JSON.stringify(prepared.database)).not.toContain(prepared.correlation.browserBindingSecret)
    expect(prepared.correlation).toMatchObject({ brokerHandle: input.brokerHandle, browserBindingSecret: 'C'.repeat(43) })
  })
})
