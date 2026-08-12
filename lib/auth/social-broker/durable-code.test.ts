import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import {
  brokerAuthorizationCodeDigest,
  decryptBrokerDownstreamNonce,
  prepareBrokerAuthorizationCode,
} from './durable-code'
import { calculateS256Challenge, createPkceVerifier } from './pkce'

const key = { version: 7, material: Buffer.alloc(32, 0x71) }
const clientId = 'supabase-social-broker'
const redirectUri = 'https://auth.schoollove.invalid/callback'
const authenticationTime = () => Math.floor(Date.now() / 1000) - 1

describe('durable broker authorization-code preparation', () => {
  it('keeps raw code only in the ephemeral response and stores a domain-separated 32-byte digest', () => {
    const prepared = prepareBrokerAuthorizationCode({ clientId, redirectUri, pkceS256Challenge: calculateS256Challenge(createPkceVerifier()), authenticationTime: authenticationTime() })
    expect(prepared.response.authorizationCode).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(prepared.database.codeDigest).toHaveLength(32)
    expect(Buffer.from(prepared.database.codeDigest)).toEqual(Buffer.from(brokerAuthorizationCodeDigest(prepared.response.authorizationCode)))
    expect(JSON.stringify(prepared.database)).not.toContain(prepared.response.authorizationCode)
    expect(prepared.database.downstreamNonce).toBeNull()
  })

  it('encrypts an exact downstream nonce with record/client/redirect/key AAD', () => {
    const prepared = prepareBrokerAuthorizationCode({
      clientId,
      redirectUri,
      pkceS256Challenge: calculateS256Challenge(createPkceVerifier()),
      authenticationTime: authenticationTime(),
      downstreamNonce: 'Exact downstream nonce: /?=+_~',
      downstreamNonceKey: key,
    })
    const encrypted = prepared.database.downstreamNonce!
    expect(decryptBrokerDownstreamNonce({ encrypted, key, codeId: prepared.database.codeId, clientId, redirectUri })).toBe('Exact downstream nonce: /?=+_~')
    for (const changed of [
      { codeId: 'f0000000-0000-4000-8000-000000000001' },
      { clientId: 'other-client' },
      { redirectUri: 'https://auth.schoollove.invalid/other' },
    ]) {
      expect(() => decryptBrokerDownstreamNonce({ encrypted, key, codeId: prepared.database.codeId, clientId, redirectUri, ...changed })).toThrow('BROKER_CODE_NONCE_DECRYPTION_REJECTED')
    }
    expect(() => decryptBrokerDownstreamNonce({ encrypted, key: { version: 8, material: key.material }, codeId: prepared.database.codeId, clientId, redirectUri })).toThrow('BROKER_CODE_NONCE_DECRYPTION_REJECTED')
    expect(() => decryptBrokerDownstreamNonce({ encrypted: { ...encrypted, ciphertext: Buffer.concat([Buffer.from(encrypted.ciphertext).subarray(0, -1), Buffer.from([0])]) }, key, codeId: prepared.database.codeId, clientId, redirectUri })).toThrow('BROKER_CODE_NONCE_DECRYPTION_REJECTED')
  })

  it('requires an S256 challenge and a nonce key iff a downstream nonce is supplied', () => {
    expect(() => prepareBrokerAuthorizationCode({ clientId, redirectUri, pkceS256Challenge: 'not-s256', authenticationTime: 1 })).toThrow('BROKER_AUTHORIZATION_CODE_PREPARATION_REJECTED')
    expect(() => prepareBrokerAuthorizationCode({ clientId, redirectUri, pkceS256Challenge: calculateS256Challenge(createPkceVerifier()), authenticationTime: -1 })).toThrow('BROKER_AUTHORIZATION_CODE_PREPARATION_REJECTED')
    expect(() => prepareBrokerAuthorizationCode({ clientId, redirectUri, pkceS256Challenge: calculateS256Challenge(createPkceVerifier()), authenticationTime: 1, downstreamNonce: 'nonce' })).toThrow('BROKER_AUTHORIZATION_CODE_PREPARATION_REJECTED')
  })
})
