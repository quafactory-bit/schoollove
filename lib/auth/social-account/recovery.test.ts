import { describe, expect, it } from 'vitest'
import {
  RECOVERY_VERIFICATION_MAX_FAILURES,
  RECOVERY_VERIFICATION_TTL_SECONDS,
  canonicalizeRecoveryEmail,
  decryptRecoveryEmail,
  encryptRecoveryEmail,
  recoveryEmailHmac,
  recoveryOtpMac,
  verifyRecoveryOtpMac,
} from './recovery'

const hmacKey = { version: 7, material: Buffer.alloc(32, 0x11) }
const encryptionKey = { version: 9, material: Buffer.alloc(32, 0x22) }
const otpKey = { version: 11, material: Buffer.alloc(32, 0x33) }
const challenge = '10000000-0000-4000-8000-000000000001'

describe('recovery-email frozen canonicalization and crypto contract', () => {
  it('trims only outer ASCII whitespace and preserves local case, Unicode, plus and dots', () => {
    expect(canonicalizeRecoveryEmail(' \tUser.Name+태그@BÜCHER.Example\r\n')).toBe('User.Name+태그@xn--bcher-kva.example')
    expect(canonicalizeRecoveryEmail('Case@EXAMPLE.INVALID')).toBe('Case@example.invalid')
  })

  it('rejects malformed addresses without normalizing the local part', () => {
    for (const value of ['', 'no-at', 'a@@example.invalid', '.a@example.invalid', 'a..b@example.invalid', 'a@-bad.invalid', 'a@bad-.invalid', 'a @example.invalid']) {
      expect(() => canonicalizeRecoveryEmail(value)).toThrow('RECOVERY_EMAIL_INVALID')
    }
  })

  it('uses a deterministic, full-length, version-separated HMAC', () => {
    const canonical = canonicalizeRecoveryEmail('User+tag@EXAMPLE.INVALID')
    expect(recoveryEmailHmac(canonical, hmacKey)).toHaveLength(32)
    expect(Buffer.compare(Buffer.from(recoveryEmailHmac(canonical, hmacKey)), Buffer.from(recoveryEmailHmac(canonical, hmacKey)))).toBe(0)
    expect(Buffer.compare(Buffer.from(recoveryEmailHmac(canonical, hmacKey)), Buffer.from(recoveryEmailHmac(canonical, { ...hmacKey, version: 8 })))).not.toBe(0)
    expect(Buffer.compare(Buffer.from(recoveryEmailHmac(canonical, hmacKey)), Buffer.from(recoveryEmailHmac(canonical, { version: 8, material: Buffer.alloc(32, 0x44) })))).not.toBe(0)
  })

  it('encrypts with AES-256-GCM, unique 96-bit nonces and stable AAD binding', () => {
    const first = encryptRecoveryEmail({ canonicalEmail: 'User.Name+tag@example.invalid', key: encryptionKey, purpose: 'activation', recordId: challenge })
    const second = encryptRecoveryEmail({ canonicalEmail: 'User.Name+tag@example.invalid', key: encryptionKey, purpose: 'activation', recordId: challenge })
    expect(first.nonce).toHaveLength(12)
    expect(first.ciphertext).toHaveLength('User.Name+tag@example.invalid'.length + 16)
    expect(Buffer.compare(Buffer.from(first.nonce), Buffer.from(second.nonce))).not.toBe(0)
    expect(decryptRecoveryEmail({ encrypted: first, key: encryptionKey, purpose: 'activation', recordId: challenge })).toBe('User.Name+tag@example.invalid')
    expect(() => decryptRecoveryEmail({ encrypted: first, key: { version: 9, material: Buffer.alloc(32, 0x55) }, purpose: 'activation', recordId: challenge })).toThrow('RECOVERY_DECRYPTION_REJECTED')
    expect(() => decryptRecoveryEmail({ encrypted: { ...first, ciphertext: Buffer.concat([first.ciphertext.subarray(0, -1), Buffer.from([first.ciphertext.at(-1)! ^ 1])]) }, key: encryptionKey, purpose: 'activation', recordId: challenge })).toThrow('RECOVERY_DECRYPTION_REJECTED')
  })

  it('MACs framed OTP values without retaining the OTP', () => {
    const mac = recoveryOtpMac(challenge, '123456', otpKey)
    expect(mac).toHaveLength(32)
    expect(verifyRecoveryOtpMac({ challengeId: challenge, otp: '123456', expectedMac: mac, key: otpKey })).toBe(true)
    expect(verifyRecoveryOtpMac({ challengeId: challenge, otp: '123457', expectedMac: mac, key: otpKey })).toBe(false)
    expect(RECOVERY_VERIFICATION_TTL_SECONDS).toBe(600)
    expect(RECOVERY_VERIFICATION_MAX_FAILURES).toBe(5)
  })
})
