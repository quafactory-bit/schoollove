import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { decryptBrokerDownstreamNonce } from './durable-code'
import { prepareTransactionBoundBrokerCode } from './transaction-bound-code-issuance'

const key = { version: 9, material: Buffer.alloc(32, 0x4a) }
const context = Object.freeze({
  authorizationTransactionId: 'b1000000-0000-4000-8000-000000000001',
  loginAttemptId: 'b1000000-0000-4000-8000-000000000002',
  clientId: 'slb-supabase-google',
  redirectUri: 'https://consumer.invalid/return?fixed=1',
  pkceS256Challenge: 'A'.repeat(43),
  downstreamNonce: 'trusted nonce exactly',
  downstreamState: 'state +/%? exact',
})

describe('transaction-bound broker code preparation', () => {
  it('derives code bindings exclusively from trusted durable context', () => {
    const prepared = prepareTransactionBoundBrokerCode({ context, authenticationTime: 1, downstreamNonceKey: key })
    expect(prepared.database.authorizationTransactionId).toBe(context.authorizationTransactionId)
    expect(prepared.database.loginAttemptId).toBe(context.loginAttemptId)
    expect(prepared.database.code.clientId).toBe(context.clientId)
    expect(prepared.database.code.redirectUri).toBe(context.redirectUri)
    expect(prepared.database.code.pkceS256Challenge).toBe(context.pkceS256Challenge)
    expect(prepared.response.downstreamState).toBe(context.downstreamState)
    expect(prepared.database.downstreamNonceProof).toBe(context.downstreamNonce)
    expect(decryptBrokerDownstreamNonce({
      encrypted: prepared.database.code.downstreamNonce!, key, codeId: prepared.database.code.codeId,
      clientId: context.clientId, redirectUri: context.redirectUri,
    })).toBe(context.downstreamNonce)
    expect(JSON.stringify(prepared.database)).not.toContain(prepared.response.authorizationCode)
  })

  it('accepts no nonce tuple when the trusted transaction has no nonce', () => {
    const prepared = prepareTransactionBoundBrokerCode({ context: { ...context, downstreamNonce: null, downstreamState: null }, authenticationTime: 1 })
    expect(prepared.database.code.downstreamNonce).toBeNull()
    expect(prepared.database.downstreamNonceProof).toBeNull()
    expect(prepared.response.downstreamState).toBeNull()
  })

  it('rejects malformed trusted context and nonce-key mismatches', () => {
    expect(() => prepareTransactionBoundBrokerCode({ context: { ...context, authorizationTransactionId: 'browser-value' }, authenticationTime: 1, downstreamNonceKey: key })).toThrow('TRANSACTION_BOUND_BROKER_CODE_PREPARATION_REJECTED')
    expect(() => prepareTransactionBoundBrokerCode({ context, authenticationTime: 1 })).toThrow('TRANSACTION_BOUND_BROKER_CODE_PREPARATION_REJECTED')
    expect(() => prepareTransactionBoundBrokerCode({ context: { ...context, downstreamNonce: null }, authenticationTime: 1, downstreamNonceKey: key })).toThrow('TRANSACTION_BOUND_BROKER_CODE_PREPARATION_REJECTED')
    expect(() => prepareTransactionBoundBrokerCode({ context, authenticationTime: -1, downstreamNonceKey: key })).toThrow('TRANSACTION_BOUND_BROKER_CODE_PREPARATION_REJECTED')
  })
})
