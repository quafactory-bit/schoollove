import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { domainToASCII } from 'node:url'

const ASCII_OUTER_WHITESPACE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g
const HMAC_BYTES = 32
const GCM_NONCE_BYTES = 12
const GCM_TAG_BYTES = 16
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RECOVERY_AAD_DOMAIN = 'schoollove:recovery-email-aad:v1'
const APPROVED_RECOVERY_PURPOSES = new Set(['activation', 'change', 'cross_provider_check', 'recovery_assistance'])

export const RECOVERY_OTP_DIGITS = 8
const OTP_PATTERN = new RegExp(`^[0-9]{${RECOVERY_OTP_DIGITS}}$`)

export type VersionedKey = Readonly<{ version: number; material: Uint8Array }>
export type RecoveryEmailCiphertext = Readonly<{ ciphertext: Uint8Array; nonce: Uint8Array; keyVersion: number }>

function assertVersionedKey(key: VersionedKey, label: string): void {
  if (!Number.isInteger(key.version) || key.version < 1 || key.version > 32767 || key.material.byteLength !== HMAC_BYTES) {
    throw new Error(`INVALID_${label}_KEY`)
  }
}

function asciiTrim(value: string): string {
  return value.replace(ASCII_OUTER_WHITESPACE, '')
}

function validAsciiDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253 || domain.startsWith('.') || domain.endsWith('.')) return false
  return domain.split('.').every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
}

function validRecoveryLocalPart(local: string): boolean {
  // Explicitly support only an unquoted atom-style local part. This deliberately
  // rejects RFC quoted strings and domain literals without rewriting accepted text.
  return local.length > 0
    && !new RegExp('[<>()\\[\\],;:"\\\\]', 'u').test(local)
    && !local.startsWith('.')
    && !local.endsWith('.')
    && !local.includes('..')
}

function framed(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(bytes.byteLength)
  return Buffer.concat([length, bytes])
}

function recoveryAad(purpose: string, recordId: string): Buffer {
  if (!APPROVED_RECOVERY_PURPOSES.has(purpose) || !UUID_PATTERN.test(recordId)) {
    throw new Error('RECOVERY_ENCRYPTION_INPUT_INVALID')
  }
  return Buffer.concat([framed(RECOVERY_AAD_DOMAIN), framed(purpose), framed(recordId)])
}

/**
 * Contract deliberately preserves the verified local part byte-for-byte after
 * ASCII outer whitespace removal. It neither case-folds nor normalizes Unicode.
 */
export function canonicalizeRecoveryEmail(input: string): string {
  if (typeof input !== 'string') throw new Error('RECOVERY_EMAIL_INVALID')
  const trimmed = asciiTrim(input)
  if (trimmed.length === 0 || trimmed.length > 254 || /[\u0000-\u001f\u007f\s]/u.test(trimmed)) {
    throw new Error('RECOVERY_EMAIL_INVALID')
  }
  const firstAt = trimmed.indexOf('@')
  if (firstAt <= 0 || firstAt !== trimmed.lastIndexOf('@')) throw new Error('RECOVERY_EMAIL_INVALID')
  const local = trimmed.slice(0, firstAt)
  const unicodeDomain = trimmed.slice(firstAt + 1)
  if (local.length > 64 || !validRecoveryLocalPart(local)) {
    throw new Error('RECOVERY_EMAIL_INVALID')
  }
  const asciiDomain = domainToASCII(unicodeDomain)
  if (!validAsciiDomain(asciiDomain)) throw new Error('RECOVERY_EMAIL_INVALID')
  return `${local}@${asciiDomain.toLowerCase()}`
}

export function recoveryEmailHmac(canonicalEmail: string, key: VersionedKey): Uint8Array {
  assertVersionedKey(key, 'RECOVERY_HMAC')
  const canonical = canonicalizeRecoveryEmail(canonicalEmail)
  return createHmac('sha256', key.material)
    .update(`schoollove:recovery-email-hmac:v1:key-${key.version}\0`, 'utf8')
    .update(canonical, 'utf8')
    .digest()
}

export function encryptRecoveryEmail(input: Readonly<{
  canonicalEmail: string
  key: VersionedKey
  purpose: string
  recordId: string
  nonce?: Uint8Array
}>): RecoveryEmailCiphertext {
  assertVersionedKey(input.key, 'RECOVERY_ENCRYPTION')
  const nonce = input.nonce ? Buffer.from(input.nonce) : randomBytes(GCM_NONCE_BYTES)
  if (nonce.byteLength !== GCM_NONCE_BYTES) throw new Error('RECOVERY_ENCRYPTION_INPUT_INVALID')
  const cipher = createCipheriv('aes-256-gcm', input.key.material, nonce, { authTagLength: GCM_TAG_BYTES })
  cipher.setAAD(recoveryAad(input.purpose, input.recordId))
  const body = Buffer.concat([cipher.update(canonicalizeRecoveryEmail(input.canonicalEmail), 'utf8'), cipher.final()])
  return Object.freeze({
    ciphertext: Buffer.concat([body, cipher.getAuthTag()]),
    nonce,
    keyVersion: input.key.version,
  })
}

export function decryptRecoveryEmail(input: Readonly<{
  encrypted: RecoveryEmailCiphertext
  key: VersionedKey
  purpose: string
  recordId: string
}>): string {
  assertVersionedKey(input.key, 'RECOVERY_ENCRYPTION')
  if (input.encrypted.keyVersion !== input.key.version || input.encrypted.nonce.byteLength !== GCM_NONCE_BYTES
    || input.encrypted.ciphertext.byteLength <= GCM_TAG_BYTES) {
    throw new Error('RECOVERY_DECRYPTION_REJECTED')
  }
  try {
    const value = Buffer.from(input.encrypted.ciphertext)
    const body = value.subarray(0, -GCM_TAG_BYTES)
    const tag = value.subarray(-GCM_TAG_BYTES)
    const decipher = createDecipheriv('aes-256-gcm', input.key.material, input.encrypted.nonce, { authTagLength: GCM_TAG_BYTES })
    decipher.setAAD(recoveryAad(input.purpose, input.recordId))
    decipher.setAuthTag(tag)
    return canonicalizeRecoveryEmail(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'))
  } catch {
    throw new Error('RECOVERY_DECRYPTION_REJECTED')
  }
}

function framedOtp(challengeId: string, otp: string): Buffer {
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !OTP_PATTERN.test(otp)) throw new Error('RECOVERY_OTP_INVALID')
  return Buffer.from(`schoollove:recovery-otp-mac:v1\0${challengeId.length}:${challengeId}${otp.length}:${otp}`, 'utf8')
}

export function recoveryOtpMac(challengeId: string, otp: string, key: VersionedKey): Uint8Array {
  assertVersionedKey(key, 'RECOVERY_OTP')
  return createHmac('sha256', key.material).update(framedOtp(challengeId, otp)).digest()
}

export function verifyRecoveryOtpMac(input: Readonly<{ challengeId: string; otp: string; expectedMac: Uint8Array; key: VersionedKey }>): boolean {
  const actual = recoveryOtpMac(input.challengeId, input.otp, input.key)
  return input.expectedMac.byteLength === actual.byteLength && timingSafeEqual(Buffer.from(input.expectedMac), Buffer.from(actual))
}

export const RECOVERY_VERIFICATION_TTL_SECONDS = 600
export const RECOVERY_VERIFICATION_MAX_FAILURES = 5
