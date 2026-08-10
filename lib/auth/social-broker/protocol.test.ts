import { describe, expect, it } from 'vitest'
import { SocialBrokerError } from './errors'
import { createNonceLeg } from './nonce'
import {
  calculateS256Challenge,
  createPkceVerifier,
  estimateVerifierEntropyBits,
  requireS256,
  validatePkceVerifier,
  verifyPkce,
} from './pkce'
import { createStateLeg } from './state'

describe('state, PKCE, and nonce protocol primitives', () => {
  it('creates independent 256-bit state legs with digest-only storage and one-time verification', () => {
    const first = createStateLeg()
    const second = createStateLeg()

    expect(Buffer.from(first.rawState, 'base64url')).toHaveLength(32)
    expect(first.rawState).not.toBe(second.rawState)
    expect(first.binding.storedDigest).not.toBe(first.rawState)
    expect(first.binding.verifyAndConsume(first.rawState)).toBe(true)
    expect(() => first.binding.verifyAndConsume(first.rawState)).toThrowError(
      new SocialBrokerError('REPLAY_REJECTED'),
    )
  })

  it('consumes a substituted state and fails closed', () => {
    const leg = createStateLeg()
    expect(leg.binding.verifyAndConsume(`${leg.rawState}x`)).toBe(false)
    expect(() => leg.binding.verifyAndConsume(leg.rawState)).toThrowError(
      new SocialBrokerError('REPLAY_REJECTED'),
    )
  })

  it('implements RFC 7636 S256 and rejects plain, malformed, low-entropy, and mismatched verifiers', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(calculateS256Challenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(estimateVerifierEntropyBits(verifier)).toBeGreaterThanOrEqual(128)
    expect(() => requireS256('plain')).toThrowError(new SocialBrokerError('PKCE_DOWNGRADE_REJECTED'))
    expect(() => validatePkceVerifier('short')).toThrowError(new SocialBrokerError('PKCE_REJECTED'))
    expect(() => validatePkceVerifier('A'.repeat(43))).toThrowError(new SocialBrokerError('PKCE_REJECTED'))
    expect(verifyPkce(verifier, calculateS256Challenge(createPkceVerifier()))).toBe(false)
  })

  it('creates independent nonce legs with digest-only one-time verification', () => {
    const first = createNonceLeg()
    const second = createNonceLeg()
    expect(Buffer.from(first.rawNonce, 'base64url')).toHaveLength(32)
    expect(first.rawNonce).not.toBe(second.rawNonce)
    expect(first.binding.storedDigest).not.toBe(first.rawNonce)
    expect(first.binding.verifyAndConsume(first.rawNonce)).toBe(true)
    expect(() => first.binding.verifyAndConsume(first.rawNonce)).toThrowError(
      new SocialBrokerError('REPLAY_REJECTED'),
    )
  })
})
