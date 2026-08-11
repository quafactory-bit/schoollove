import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import {
  RECOVERY_OTP_DIGITS,
  canonicalizeRecoveryEmail,
  encryptRecoveryEmailForAccount,
  recoveryEmailHmac,
  recoveryOtpMac,
  type VersionedKey,
} from './recovery'

export type PreparedAttemptRecoveryChallenge = Readonly<{
  /** Service-only database payload. It contains no raw email or OTP. */
  database: Readonly<{
    challengeId: string
    reservedAccountId: string
    recoveryEmailHmac: Uint8Array
    recoveryEmailHmacKeyVersion: number
    destinationCiphertext: Uint8Array
    destinationNonce: Uint8Array
    encryptionKeyVersion: number
    otpMac: Uint8Array
    otpKeyVersion: number
  }>
  /** Ephemeral delivery payload. Never persist, log, cache, or put in env. */
  delivery: Readonly<{ canonicalEmail: string; otp: string }>
}>

/** Generates exactly eight decimal digits from Node's CSPRNG; leading zeros stay significant. */
export function generateRecoveryOtp(): string {
  return randomInt(0, 100_000_000).toString().padStart(RECOVERY_OTP_DIGITS, '0')
}

/**
 * Prepares the one-time material before the service-only DB RPC. The UUIDs are
 * intentionally generated here: OTP MAC binds the challenge ID and ciphertext
 * AAD binds the reserved account ID that a successful NEW decision must use.
 */
export function prepareAttemptRecoveryChallenge(input: Readonly<{
  recoveryEmail: string
  recoveryHmacKey: VersionedKey
  recoveryEncryptionKey: VersionedKey
  otpMacKey: VersionedKey
}>): PreparedAttemptRecoveryChallenge {
  const canonicalEmail = canonicalizeRecoveryEmail(input.recoveryEmail)
  const challengeId = randomUUID()
  const reservedAccountId = randomUUID()
  const otp = generateRecoveryOtp()
  const encrypted = encryptRecoveryEmailForAccount({ canonicalEmail, key: input.recoveryEncryptionKey, accountId: reservedAccountId })
  return Object.freeze({
    database: Object.freeze({
      challengeId,
      reservedAccountId,
      recoveryEmailHmac: recoveryEmailHmac(canonicalEmail, input.recoveryHmacKey),
      recoveryEmailHmacKeyVersion: input.recoveryHmacKey.version,
      destinationCiphertext: encrypted.ciphertext,
      destinationNonce: encrypted.nonce,
      encryptionKeyVersion: encrypted.keyVersion,
      otpMac: recoveryOtpMac(challengeId, otp, input.otpMacKey),
      otpKeyVersion: input.otpMacKey.version,
    }),
    delivery: Object.freeze({ canonicalEmail, otp }),
  })
}
