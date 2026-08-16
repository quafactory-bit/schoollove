import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { decryptUpstreamContinuation, encryptUpstreamContinuation } from './durable-continuation-recovery'

const key = { version: 4, material: Buffer.alloc(32, 7) } as const
const context = { attemptId: '10000000-0000-4000-8000-000000000001', legId: '10000000-0000-4000-8000-000000000002', provider: 'google' as const, clientBindingDigest: Buffer.alloc(32, 3) }
const plaintext = { rawState: 'S'.repeat(43), rawNonce: 'N'.repeat(43) } as const

describe('durable upstream continuation recovery envelope', () => {
  it('round-trips exact state and optional nonce without serializing plaintext', () => {
    const encrypted = encryptUpstreamContinuation({ plaintext, key, ...context, iv: Buffer.alloc(12, 9) })
    expect(decryptUpstreamContinuation({ encrypted, key, ...context })).toEqual(plaintext)
    expect(JSON.stringify(encrypted)).not.toContain(plaintext.rawState)
    expect(JSON.stringify(encrypted)).not.toContain(plaintext.rawNonce)
    const naver = encryptUpstreamContinuation({ plaintext: { rawState: 'T'.repeat(43), rawNonce: null }, key, ...context, provider: 'naver', iv: Buffer.alloc(12, 8) })
    expect(decryptUpstreamContinuation({ encrypted: naver, key, ...context, provider: 'naver' })).toEqual({ rawState: 'T'.repeat(43), rawNonce: null })
  })

  it('fails closed on wrong AAD, key, version, and tampering', () => {
    const encrypted = encryptUpstreamContinuation({ plaintext, key, ...context, iv: Buffer.alloc(12, 9) })
    const reject = (override: object) => expect(() => decryptUpstreamContinuation({ encrypted, key, ...context, ...override })).toThrow('UPSTREAM_CONTINUATION_DECRYPTION_REJECTED')
    reject({ attemptId: '10000000-0000-4000-8000-000000000003' })
    reject({ legId: '10000000-0000-4000-8000-000000000003' })
    reject({ provider: 'kakao' })
    reject({ clientBindingDigest: Buffer.alloc(32, 4) })
    reject({ key: { version: 4, material: Buffer.alloc(32, 8) } })
    reject({ key: { version: 5, material: Buffer.alloc(32, 7) } })
    reject({ encrypted: { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext).map((value, index) => index === 0 ? value ^ 1 : value) } })
  })
})
