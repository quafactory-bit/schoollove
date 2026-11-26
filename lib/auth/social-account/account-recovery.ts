import 'server-only'
import { randomUUID } from 'node:crypto'
import {
  canonicalizeRecoveryEmail,
  encryptRecoveryEmailForAccount,
  recoveryEmailHmac,
  recoveryOtpMac,
  type VersionedKey,
} from './recovery'
import { generateRecoveryOtp } from './recovery-preparation'
import type { RecoveryOtpDeliveryTransport } from './recovery-delivery'

/**
 * Part 2 P2b: register the 8-digit custom recovery email LATER, from /account,
 * for an active account that skipped it at sign-up. Same crypto envelope as the
 * sign-up path (HMAC for duplicate protection, AES-GCM bound to the real account
 * id, OTP MAC bound to the challenge id). Raw email/OTP never reach the DB.
 */
export type AccountRecoveryKeys = Readonly<{
  recoveryHmacKey: VersionedKey
  recoveryEncryptionKey: VersionedKey
  otpMacKey: VersionedKey
}>

export type AccountRecoveryDatabase = Readonly<{
  reserve(input: Readonly<{
    authUserId: string; accountId: string; verificationId: string
    hmac: Uint8Array; hmacKeyVersion: number; ciphertext: Uint8Array; nonce: Uint8Array; encryptionKeyVersion: number
    otpMac: Uint8Array; otpKeyVersion: number
  }>): Promise<Readonly<{ outcome: string; verificationId: string | null; deliveryId: string | null }>>
  markSent(deliveryId: string): Promise<void>
  fail(deliveryId: string): Promise<void>
  consume(input: Readonly<{ authUserId: string; verificationId: string; otpMac: Uint8Array }>): Promise<string>
}>

export type AccountRecoverySendResult =
  | Readonly<{ state: 'sent'; verificationId: string }>
  | Readonly<{ state: 'limited' | 'already_registered' | 'unavailable' | 'failed' }>

export async function sendAccountRecoveryOtp(input: Readonly<{
  authUserId: string; accountId: string; recoveryEmail: string
  keys: AccountRecoveryKeys; database: AccountRecoveryDatabase; transport: RecoveryOtpDeliveryTransport
}>): Promise<AccountRecoverySendResult> {
  const canonicalEmail = canonicalizeRecoveryEmail(input.recoveryEmail)
  const verificationId = randomUUID()
  const otp = generateRecoveryOtp()
  const encrypted = encryptRecoveryEmailForAccount({ canonicalEmail, key: input.keys.recoveryEncryptionKey, accountId: input.accountId })
  const reserved = await input.database.reserve({
    authUserId: input.authUserId, accountId: input.accountId, verificationId,
    hmac: recoveryEmailHmac(canonicalEmail, input.keys.recoveryHmacKey), hmacKeyVersion: input.keys.recoveryHmacKey.version,
    ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, encryptionKeyVersion: encrypted.keyVersion,
    otpMac: recoveryOtpMac(verificationId, otp, input.keys.otpMacKey), otpKeyVersion: input.keys.otpMacKey.version,
  })
  if (reserved.outcome === 'RECOVERY_DELIVERY_ALREADY_SENT' && reserved.verificationId) return Object.freeze({ state: 'sent', verificationId: reserved.verificationId })
  if (reserved.outcome === 'RECOVERY_DELIVERY_LIMITED') return Object.freeze({ state: 'limited' })
  if (reserved.outcome === 'ACCOUNT_RECOVERY_ALREADY_REGISTERED') return Object.freeze({ state: 'already_registered' })
  if (reserved.outcome !== 'RECOVERY_DELIVERY_RESERVED' || reserved.verificationId !== verificationId || !reserved.deliveryId) return Object.freeze({ state: 'unavailable' })
  try {
    await input.transport.send({ canonicalEmail, otp }, { deliveryId: reserved.deliveryId })
    await input.database.markSent(reserved.deliveryId)
    return Object.freeze({ state: 'sent', verificationId })
  } catch {
    // Never retried here; the reserved slot is spent and terminally failed.
    try { await input.database.fail(reserved.deliveryId) } catch {}
    return Object.freeze({ state: 'failed' })
  }
}

export type AccountRecoveryVerifyResult = 'registered' | 'otp_rejected' | 'locked' | 'expired' | 'email_unavailable' | 'already_registered' | 'rejected'

export async function verifyAccountRecoveryOtp(input: Readonly<{
  authUserId: string; verificationId: string; otp: string; otpMacKey: VersionedKey; database: AccountRecoveryDatabase
}>): Promise<AccountRecoveryVerifyResult> {
  if (!/^[0-9]{8}$/.test(input.otp)) return 'otp_rejected'
  const outcome = await input.database.consume({ authUserId: input.authUserId, verificationId: input.verificationId, otpMac: recoveryOtpMac(input.verificationId, input.otp, input.otpMacKey) })
  switch (outcome) {
    case 'RECOVERY_REGISTERED': return 'registered'
    case 'OTP_REJECTED': return 'otp_rejected'
    case 'LOCKED': return 'locked'
    case 'EXPIRED': return 'expired'
    case 'RECOVERY_EMAIL_UNAVAILABLE': return 'email_unavailable'
    case 'ACCOUNT_RECOVERY_ALREADY_REGISTERED': return 'already_registered'
    default: return 'rejected'
  }
}
