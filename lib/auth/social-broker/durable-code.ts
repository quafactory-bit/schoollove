import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'

const CODE_DIGEST_DOMAIN = 'schoollove:broker-authorization-code:v1\0'
const NONCE_DIGEST_DOMAIN = 'schoollove:broker-code-downstream-nonce-digest:v1\0'
const NONCE_AAD_DOMAIN = 'schoollove:broker-code-downstream-nonce:v1'
const GCM_IV_BYTES = 12
const GCM_TAG_BYTES = 16
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PKCE_S256_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** A separate, injected test/runtime key; it is never a recovery-email key. */
export type BrokerAuthorizationCodeNonceKey = Readonly<{ version: number; material: Uint8Array }>

export type DurableDownstreamNonce = Readonly<{
  digest: Uint8Array
  ciphertext: Uint8Array
  iv: Uint8Array
  keyVersion: number
}>

export type PreparedBrokerAuthorizationCode = Readonly<{
  /** Service-only DB payload. It never contains the raw authorization code or nonce. */
  database: Readonly<{
    codeId: string
    codeDigest: Uint8Array
    clientId: string
    redirectUri: string
    pkceS256Challenge: string
    authenticationTime: number
    downstreamNonce: DurableDownstreamNonce | null
  }>
  /** Ephemeral response payload. Never persist, log, cache, or put in environment. */
  response: Readonly<{ authorizationCode: string }>
}>

function framed(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(bytes.byteLength)
  return Buffer.concat([length, bytes])
}

function assertKey(key: BrokerAuthorizationCodeNonceKey): void {
  if (!Number.isInteger(key.version) || key.version < 1 || key.version > 32767 || key.material.byteLength !== 32) {
    throw new Error('BROKER_CODE_NONCE_KEY_INVALID')
  }
}

function nonceAad(codeId: string, clientId: string, redirectUri: string, keyVersion: number): Buffer {
  if (!UUID_PATTERN.test(codeId) || !clientId || !redirectUri || !Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 32767) {
    throw new Error('BROKER_CODE_NONCE_INPUT_INVALID')
  }
  return Buffer.concat([
    framed(NONCE_AAD_DOMAIN),
    framed(codeId),
    framed(clientId),
    framed(redirectUri),
    framed(String(keyVersion)),
  ])
}

export function brokerAuthorizationCodeDigest(rawCode: string): Uint8Array {
  if (typeof rawCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(rawCode)) {
    throw new Error('BROKER_AUTHORIZATION_CODE_INVALID')
  }
  return createHash('sha256').update(CODE_DIGEST_DOMAIN, 'utf8').update(rawCode, 'ascii').digest()
}

export function brokerDownstreamNonceDigest(nonce: string): Uint8Array {
  if (typeof nonce !== 'string' || nonce.length === 0) throw new Error('BROKER_CODE_NONCE_INPUT_INVALID')
  return createHash('sha256').update(NONCE_DIGEST_DOMAIN, 'utf8').update(nonce, 'utf8').digest()
}

export function encryptBrokerDownstreamNonce(input: Readonly<{
  nonce: string
  key: BrokerAuthorizationCodeNonceKey
  codeId: string
  clientId: string
  redirectUri: string
  iv?: Uint8Array
}>): DurableDownstreamNonce {
  assertKey(input.key)
  const iv = input.iv ? Buffer.from(input.iv) : randomBytes(GCM_IV_BYTES)
  if (iv.byteLength !== GCM_IV_BYTES) throw new Error('BROKER_CODE_NONCE_INPUT_INVALID')
  const cipher = createCipheriv('aes-256-gcm', input.key.material, iv, { authTagLength: GCM_TAG_BYTES })
  cipher.setAAD(nonceAad(input.codeId, input.clientId, input.redirectUri, input.key.version))
  const body = Buffer.concat([cipher.update(input.nonce, 'utf8'), cipher.final()])
  return Object.freeze({
    digest: brokerDownstreamNonceDigest(input.nonce),
    ciphertext: Buffer.concat([body, cipher.getAuthTag()]),
    iv,
    keyVersion: input.key.version,
  })
}

export function decryptBrokerDownstreamNonce(input: Readonly<{
  encrypted: DurableDownstreamNonce
  key: BrokerAuthorizationCodeNonceKey
  codeId: string
  clientId: string
  redirectUri: string
}>): string {
  assertKey(input.key)
  if (input.encrypted.keyVersion !== input.key.version || input.encrypted.iv.byteLength !== GCM_IV_BYTES || input.encrypted.ciphertext.byteLength <= GCM_TAG_BYTES) {
    throw new Error('BROKER_CODE_NONCE_DECRYPTION_REJECTED')
  }
  try {
    const payload = Buffer.from(input.encrypted.ciphertext)
    const body = payload.subarray(0, -GCM_TAG_BYTES)
    const tag = payload.subarray(-GCM_TAG_BYTES)
    const decipher = createDecipheriv('aes-256-gcm', input.key.material, input.encrypted.iv, { authTagLength: GCM_TAG_BYTES })
    decipher.setAAD(nonceAad(input.codeId, input.clientId, input.redirectUri, input.key.version))
    decipher.setAuthTag(tag)
    const nonce = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
    if (!Buffer.from(brokerDownstreamNonceDigest(nonce)).equals(Buffer.from(input.encrypted.digest))) {
      throw new Error('digest mismatch')
    }
    return nonce
  } catch {
    throw new Error('BROKER_CODE_NONCE_DECRYPTION_REJECTED')
  }
}

export function prepareBrokerAuthorizationCode(input: Readonly<{
  clientId: string
  redirectUri: string
  pkceS256Challenge: string
  authenticationTime: number
  downstreamNonce?: string
  downstreamNonceKey?: BrokerAuthorizationCodeNonceKey
}>): PreparedBrokerAuthorizationCode {
  if (!input.clientId || !input.redirectUri || !PKCE_S256_PATTERN.test(input.pkceS256Challenge) || !Number.isSafeInteger(input.authenticationTime) || (input.downstreamNonce === undefined) !== (input.downstreamNonceKey === undefined)) {
    throw new Error('BROKER_AUTHORIZATION_CODE_PREPARATION_REJECTED')
  }
  const codeId = randomUUID()
  const authorizationCode = randomBytes(32).toString('base64url')
  const downstreamNonce = input.downstreamNonce === undefined
    ? null
    : encryptBrokerDownstreamNonce({
      nonce: input.downstreamNonce,
      key: input.downstreamNonceKey!,
      codeId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
    })
  return Object.freeze({
    database: Object.freeze({
      codeId,
      codeDigest: brokerAuthorizationCodeDigest(authorizationCode),
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      pkceS256Challenge: input.pkceS256Challenge,
      authenticationTime: input.authenticationTime,
      downstreamNonce,
    }),
    response: Object.freeze({ authorizationCode }),
  })
}
