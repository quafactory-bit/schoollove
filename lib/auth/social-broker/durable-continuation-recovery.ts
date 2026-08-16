import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SocialProvider } from './types'

const PURPOSE = 'schoollove:upstream-authorization-continuation-envelope:v1'
const CONTRACT_VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const RAW_PATTERN = /^[A-Za-z0-9_-]{43}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Dedicated injected custody. Never reuse recovery-email, downstream-nonce, or PKCE verifier material. */
export type UpstreamContinuationRecoveryKey = Readonly<{ version: number; material: Uint8Array }>
export type EncryptedUpstreamContinuation = Readonly<{ ciphertext: Uint8Array; iv: Uint8Array; keyVersion: number }>
export type UpstreamContinuationPlaintext = Readonly<{ rawState: string; rawNonce: string | null }>

function framed(value: Uint8Array | string): Buffer {
  const body = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(body.byteLength)
  return Buffer.concat([length, body])
}

function assertProvider(provider: SocialProvider): void {
  if (!['kakao', 'naver', 'google'].includes(provider)) throw new Error('UPSTREAM_CONTINUATION_INPUT_REJECTED')
}

function assertKey(key: UpstreamContinuationRecoveryKey): void {
  if (!Number.isInteger(key.version) || key.version < 1 || key.version > 32767 || key.material.byteLength !== 32) throw new Error('UPSTREAM_CONTINUATION_KEY_INVALID')
}

function assertContext(input: Readonly<{ attemptId: string; legId: string; provider: SocialProvider; clientBindingDigest: Uint8Array; keyVersion: number }>): void {
  assertProvider(input.provider)
  if (!UUID_PATTERN.test(input.attemptId) || !UUID_PATTERN.test(input.legId) || input.clientBindingDigest.byteLength !== 32
    || !Number.isInteger(input.keyVersion) || input.keyVersion < 1 || input.keyVersion > 32767) throw new Error('UPSTREAM_CONTINUATION_INPUT_REJECTED')
}

function aad(input: Readonly<{ attemptId: string; legId: string; provider: SocialProvider; clientBindingDigest: Uint8Array; keyVersion: number }>): Buffer {
  assertContext(input)
  return Buffer.concat([
    framed(PURPOSE), framed(CONTRACT_VERSION), framed(input.attemptId), framed(input.legId), framed(input.provider),
    framed(input.clientBindingDigest), framed(String(input.keyVersion)),
  ])
}

function encode(plain: UpstreamContinuationPlaintext, provider: SocialProvider): Buffer {
  if (!RAW_PATTERN.test(plain.rawState) || (plain.rawNonce !== null && !RAW_PATTERN.test(plain.rawNonce))) throw new Error('UPSTREAM_CONTINUATION_INPUT_REJECTED')
  if ((provider === 'naver') !== (plain.rawNonce === null)) throw new Error('UPSTREAM_CONTINUATION_INPUT_REJECTED')
  const state = Buffer.from(plain.rawState, 'ascii')
  const nonce = plain.rawNonce === null ? Buffer.alloc(0) : Buffer.from(plain.rawNonce, 'ascii')
  return Buffer.concat([Buffer.from([plain.rawNonce === null ? 0 : 1]), state, nonce])
}

function decode(payload: Uint8Array, provider: SocialProvider): UpstreamContinuationPlaintext {
  const bytes = Buffer.from(payload)
  if (bytes.byteLength !== 44 && bytes.byteLength !== 87) throw new Error('payload shape')
  const noncePresent = bytes[0] === 1
  if ((bytes.byteLength === 87) !== noncePresent) throw new Error('payload marker')
  const rawState = bytes.subarray(1, 44).toString('ascii')
  const rawNonce = noncePresent ? bytes.subarray(44, 87).toString('ascii') : null
  if (!RAW_PATTERN.test(rawState) || (rawNonce !== null && !RAW_PATTERN.test(rawNonce)) || (provider === 'naver') !== (rawNonce === null)) throw new Error('payload semantics')
  return Object.freeze({ rawState, rawNonce })
}

/** Encrypts the restart-only authorization state/nonce envelope under exact attempt/leg/provider/client AAD. */
export function encryptUpstreamContinuation(input: Readonly<{
  plaintext: UpstreamContinuationPlaintext; key: UpstreamContinuationRecoveryKey; attemptId: string; legId: string; provider: SocialProvider; clientBindingDigest: Uint8Array; iv?: Uint8Array
}>): EncryptedUpstreamContinuation {
  assertKey(input.key)
  const iv = input.iv ? Buffer.from(input.iv) : randomBytes(IV_BYTES)
  if (iv.byteLength !== IV_BYTES) throw new Error('UPSTREAM_CONTINUATION_INPUT_REJECTED')
  const cipher = createCipheriv('aes-256-gcm', input.key.material, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(aad({ ...input, keyVersion: input.key.version }))
  const body = Buffer.concat([cipher.update(encode(input.plaintext, input.provider)), cipher.final()])
  return Object.freeze({ ciphertext: Buffer.concat([body, cipher.getAuthTag()]), iv, keyVersion: input.key.version })
}

/** Decrypts only a server-resolved durable row. Authentication failure is always coarse. */
export function decryptUpstreamContinuation(input: Readonly<{
  encrypted: EncryptedUpstreamContinuation; key: UpstreamContinuationRecoveryKey; attemptId: string; legId: string; provider: SocialProvider; clientBindingDigest: Uint8Array
}>): UpstreamContinuationPlaintext {
  assertKey(input.key)
  if (input.encrypted.keyVersion !== input.key.version || input.encrypted.iv.byteLength !== IV_BYTES || input.encrypted.ciphertext.byteLength <= TAG_BYTES) throw new Error('UPSTREAM_CONTINUATION_DECRYPTION_REJECTED')
  try {
    const payload = Buffer.from(input.encrypted.ciphertext)
    const decipher = createDecipheriv('aes-256-gcm', input.key.material, input.encrypted.iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(aad({ ...input, keyVersion: input.key.version }))
    decipher.setAuthTag(payload.subarray(-TAG_BYTES))
    return decode(Buffer.concat([decipher.update(payload.subarray(0, -TAG_BYTES)), decipher.final()]), input.provider)
  } catch {
    throw new Error('UPSTREAM_CONTINUATION_DECRYPTION_REJECTED')
  }
}
