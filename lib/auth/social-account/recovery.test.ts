import { describe, expect, it, vi } from 'vitest'
import { createCipheriv } from 'node:crypto'
import {
  RECOVERY_VERIFICATION_MAX_FAILURES,
  RECOVERY_VERIFICATION_TTL_SECONDS,
  RECOVERY_OTP_DIGITS,
  canonicalizeRecoveryEmail,
  decryptRecoveryEmailForAccount,
  encryptRecoveryEmailForAccount,
  recoveryEmailHmac,
  recoveryOtpMac,
  verifyRecoveryOtpMac,
} from './recovery'

vi.mock('server-only', () => ({}))
import { generateRecoveryOtp, prepareAttemptRecoveryChallenge } from './recovery-preparation'

const hmacKey = { version: 7, material: Buffer.alloc(32, 0x11) }
const encryptionKey = { version: 9, material: Buffer.alloc(32, 0x22) }
const otpKey = { version: 11, material: Buffer.alloc(32, 0x33) }
const challenge = '10000000-0000-4000-8000-000000000001'
const account = '20000000-0000-4000-8000-000000000001'

describe('recovery-email frozen canonicalization and crypto contract', () => {
  it('trims only outer ASCII whitespace and preserves local case, Unicode, plus and dots', () => {
    expect(canonicalizeRecoveryEmail(' \tUser.Name+태그@BÜCHER.Example\r\n')).toBe('User.Name+태그@xn--bcher-kva.example')
    expect(canonicalizeRecoveryEmail('Case@EXAMPLE.INVALID')).toBe('Case@example.invalid')
  })

  it('rejects malformed addresses without normalizing the local part', () => {
    for (const value of ['', 'no-at', 'a@@example.invalid', '.a@example.invalid', 'a..b@example.invalid', 'a@-bad.invalid', 'a@bad-.invalid', 'a @example.invalid', 'a<@example.invalid', 'a>@example.invalid', 'a(@example.invalid', 'a)@example.invalid', 'a[@example.invalid', 'a]@example.invalid', 'a,@example.invalid', 'a;@example.invalid', 'a:@example.invalid', 'a"@example.invalid', 'a\\@example.invalid']) {
      expect(() => canonicalizeRecoveryEmail(value)).toThrow('RECOVERY_EMAIL_INVALID')
    }
  })

  it('enforces recovery email limits by UTF-8 byte length after IDNA conversion', () => {
    expect(() => canonicalizeRecoveryEmail(`${'가'.repeat(22)}@example.invalid`)).toThrow('RECOVERY_EMAIL_INVALID')
    expect(() => canonicalizeRecoveryEmail(`a@${Array.from({ length: 8 }, () => '가'.repeat(30)).join('.')}`)).toThrow('RECOVERY_EMAIL_INVALID')
    const maxDomain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(61)}`
    const boundary = canonicalizeRecoveryEmail(`${'L'.repeat(64)}@${maxDomain}`)
    expect(Buffer.byteLength(boundary, 'utf8')).toBe(254)
  })

  it('uses a deterministic, full-length, version-separated HMAC', () => {
    const canonical = canonicalizeRecoveryEmail('User+tag@EXAMPLE.INVALID')
    expect(recoveryEmailHmac(canonical, hmacKey)).toHaveLength(32)
    expect(Buffer.compare(Buffer.from(recoveryEmailHmac(canonical, hmacKey)), Buffer.from(recoveryEmailHmac(canonical, hmacKey)))).toBe(0)
    expect(Buffer.compare(Buffer.from(recoveryEmailHmac(canonical, hmacKey)), Buffer.from(recoveryEmailHmac(canonical, { ...hmacKey, version: 8 })))).not.toBe(0)
    expect(Buffer.compare(Buffer.from(recoveryEmailHmac(canonical, hmacKey)), Buffer.from(recoveryEmailHmac(canonical, { version: 8, material: Buffer.alloc(32, 0x44) })))).not.toBe(0)
  })

  it('binds durable account recovery ciphertext to account, fixed column, and key version', () => {
    const first = encryptRecoveryEmailForAccount({ canonicalEmail: 'User.Name+tag@example.invalid', key: encryptionKey, accountId: account })
    const second = encryptRecoveryEmailForAccount({ canonicalEmail: 'User.Name+tag@example.invalid', key: encryptionKey, accountId: account })
    expect(first.nonce).toHaveLength(12)
    expect(first.ciphertext).toHaveLength('User.Name+tag@example.invalid'.length + 16)
    expect(Buffer.compare(Buffer.from(first.nonce), Buffer.from(second.nonce))).not.toBe(0)
    expect(decryptRecoveryEmailForAccount({ encrypted: first, key: encryptionKey, accountId: account })).toBe('User.Name+tag@example.invalid')
    expect(() => decryptRecoveryEmailForAccount({ encrypted: first, key: { version: 9, material: Buffer.alloc(32, 0x55) }, accountId: account })).toThrow('RECOVERY_DECRYPTION_REJECTED')
    expect(() => decryptRecoveryEmailForAccount({ encrypted: { ...first, ciphertext: Buffer.concat([first.ciphertext.subarray(0, -1), Buffer.from([first.ciphertext.at(-1)! ^ 1])]) }, key: encryptionKey, accountId: account })).toThrow('RECOVERY_DECRYPTION_REJECTED')
    expect(() => decryptRecoveryEmailForAccount({ encrypted: first, key: encryptionKey, accountId: '20000000-0000-4000-8000-000000000002' })).toThrow('RECOVERY_DECRYPTION_REJECTED')
    expect(() => decryptRecoveryEmailForAccount({ encrypted: first, key: { ...encryptionKey, version: 10 }, accountId: account })).toThrow('RECOVERY_DECRYPTION_REJECTED')
    const frame = (value: string) => {
      const bytes = Buffer.from(value, 'utf8')
      const length = Buffer.allocUnsafe(4)
      length.writeUInt32BE(bytes.byteLength)
      return Buffer.concat([length, bytes])
    }
    const wrongColumnCipher = createCipheriv('aes-256-gcm', encryptionKey.material, Buffer.alloc(12, 0x44), { authTagLength: 16 })
    wrongColumnCipher.setAAD(Buffer.concat([frame('schoollove:recovery-email-account:v1'), frame(account), frame('other_recovery_column'), frame('9')]))
    const wrongColumn = Buffer.concat([wrongColumnCipher.update('User.Name+tag@example.invalid', 'utf8'), wrongColumnCipher.final(), wrongColumnCipher.getAuthTag()])
    expect(() => decryptRecoveryEmailForAccount({ encrypted: { ciphertext: wrongColumn, nonce: Buffer.alloc(12, 0x44), keyVersion: 9 }, key: encryptionKey, accountId: account })).toThrow('RECOVERY_DECRYPTION_REJECTED')
  })

  it('MACs framed OTP values without retaining the OTP', () => {
    const mac = recoveryOtpMac(challenge, '12345678', otpKey)
    expect(mac).toHaveLength(32)
    expect(verifyRecoveryOtpMac({ challengeId: challenge, otp: '12345678', expectedMac: mac, key: otpKey })).toBe(true)
    expect(verifyRecoveryOtpMac({ challengeId: challenge, otp: '12345679', expectedMac: mac, key: otpKey })).toBe(false)
    for (const otp of ['123456', '1234567', '123456789', '1234abcd']) {
      expect(() => recoveryOtpMac(challenge, otp, otpKey)).toThrow('RECOVERY_OTP_INVALID')
    }
    expect(RECOVERY_OTP_DIGITS).toBe(8)
    expect(RECOVERY_VERIFICATION_TTL_SECONDS).toBe(600)
    expect(RECOVERY_VERIFICATION_MAX_FAILURES).toBe(5)
  })

  it('preallocates the exact challenge and account IDs before preparing DB-only material', () => {
    const prepared = prepareAttemptRecoveryChallenge({
      recoveryEmail: '  User.Name+tag@BÜCHER.example ',
      recoveryHmacKey: hmacKey,
      recoveryEncryptionKey: encryptionKey,
      otpMacKey: otpKey,
    })
    expect(prepared.delivery.canonicalEmail).toBe('User.Name+tag@xn--bcher-kva.example')
    expect(prepared.delivery.otp).toMatch(/^\d{8}$/)
    expect(prepared.database.challengeId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(prepared.database.reservedAccountId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(prepared.database.challengeId).not.toBe(prepared.database.reservedAccountId)
    expect(verifyRecoveryOtpMac({
      challengeId: prepared.database.challengeId,
      otp: prepared.delivery.otp,
      expectedMac: prepared.database.otpMac,
      key: otpKey,
    })).toBe(true)
    expect(decryptRecoveryEmailForAccount({
      encrypted: {
        ciphertext: prepared.database.destinationCiphertext,
        nonce: prepared.database.destinationNonce,
        keyVersion: prepared.database.encryptionKeyVersion,
      },
      key: encryptionKey,
      accountId: prepared.database.reservedAccountId,
    })).toBe(prepared.delivery.canonicalEmail)
    expect(() => decryptRecoveryEmailForAccount({
      encrypted: {
        ciphertext: prepared.database.destinationCiphertext,
        nonce: prepared.database.destinationNonce,
        keyVersion: prepared.database.encryptionKeyVersion,
      },
      key: encryptionKey,
      accountId: account,
    })).toThrow('RECOVERY_DECRYPTION_REJECTED')
  })

  it('uses Node CSPRNG for eight-digit OTPs', () => {
    const values = Array.from({ length: 32 }, generateRecoveryOtp)
    expect(values.every(value => /^\d{8}$/.test(value))).toBe(true)
  })
})
