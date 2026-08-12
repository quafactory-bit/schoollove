import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { digestParts, exactUtf8 } from './crypto'
import { calculateS256Challenge, createPkceVerifier, validatePkceVerifier } from './pkce'
import type { SocialProvider } from './types'

const STATE_DOMAIN = 'schoollove:upstream-state:v1\0'
const NONCE_DOMAIN = 'schoollove:upstream-nonce:v1\0'
const CLIENT_BINDING_DOMAIN = 'schoollove:upstream-client-binding:v1\0'
const PKCE_AAD_PURPOSE = 'schoollove:upstream-pkce-verifier:v1'
const CONTRACT_VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Separate injected key material. It must never share custody with recovery or downstream nonce keys. */
export type UpstreamPkceVerifierKey = Readonly<{ version: number; material: Uint8Array }>

export type DurableUpstreamPkce = Readonly<{
  challenge: string
  ciphertext: Uint8Array
  iv: Uint8Array
  keyVersion: number
}>

export type PreparedDurableUpstreamLoginLeg = Readonly<{
  database: Readonly<{
    legId: string
    provider: SocialProvider
    clientBindingDigest: Uint8Array
    stateDigest: Uint8Array
    nonceDigest: Uint8Array | null
    pkce: DurableUpstreamPkce | null
  }>
  /** Ephemeral browser authorization material. Never persist, log, cache, or put in environment. */
  authorization: Readonly<{ rawState: string; rawNonce: string | null; pkceChallenge: string | null }>
}>

export type DurableUpstreamCallback = Readonly<{ provider: SocialProvider; authorizationCode: string; rawState: string }>

function framed(value: Uint8Array | string): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(bytes.byteLength)
  return Buffer.concat([length, bytes])
}

function assertProvider(provider: SocialProvider): void {
  if (provider !== 'kakao' && provider !== 'naver' && provider !== 'google') throw new Error('UPSTREAM_LEG_INPUT_REJECTED')
}

function assertKey(key: UpstreamPkceVerifierKey): void {
  if (!Number.isInteger(key.version) || key.version < 1 || key.version > 32767 || key.material.byteLength !== 32) {
    throw new Error('UPSTREAM_PKCE_KEY_INVALID')
  }
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error('UPSTREAM_LEG_INPUT_REJECTED')
}

function pkceAad(input: Readonly<{
  attemptId: string; legId: string; provider: SocialProvider; clientBindingDigest: Uint8Array; challenge: string; keyVersion: number
}>): Buffer {
  assertUuid(input.attemptId); assertUuid(input.legId); assertProvider(input.provider)
  if (input.clientBindingDigest.byteLength !== 32 || !/^[A-Za-z0-9_-]{43}$/.test(input.challenge) || !Number.isInteger(input.keyVersion) || input.keyVersion < 1 || input.keyVersion > 32767) {
    throw new Error('UPSTREAM_LEG_INPUT_REJECTED')
  }
  return Buffer.concat([
    framed(PKCE_AAD_PURPOSE), framed(CONTRACT_VERSION), framed(input.attemptId), framed(input.legId), framed(input.provider),
    framed(input.clientBindingDigest), framed(input.challenge), framed(String(input.keyVersion)),
  ])
}

function requireRaw(value: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('UPSTREAM_LEG_INPUT_REJECTED')
}

export function upstreamClientBindingDigest(input: Readonly<{ provider: SocialProvider; clientId: string; redirectUri: string }>): Uint8Array {
  assertProvider(input.provider)
  if (!input.clientId || !input.redirectUri) throw new Error('UPSTREAM_LEG_INPUT_REJECTED')
  return digestParts(CLIENT_BINDING_DOMAIN, [exactUtf8(input.provider), exactUtf8(input.clientId), exactUtf8(input.redirectUri), exactUtf8(CONTRACT_VERSION)])
}

export function upstreamStateDigest(rawState: string): Uint8Array {
  requireRaw(rawState)
  return digestParts(STATE_DOMAIN, [exactUtf8(rawState)])
}

export function upstreamNonceDigest(rawNonce: string): Uint8Array {
  requireRaw(rawNonce)
  return digestParts(NONCE_DOMAIN, [exactUtf8(rawNonce)])
}

export function encryptUpstreamPkceVerifier(input: Readonly<{
  verifier: string; key: UpstreamPkceVerifierKey; attemptId: string; legId: string; provider: SocialProvider; clientBindingDigest: Uint8Array; challenge: string; iv?: Uint8Array
}>): DurableUpstreamPkce {
  assertKey(input.key); validatePkceVerifier(input.verifier)
  if (calculateS256Challenge(input.verifier) !== input.challenge) throw new Error('UPSTREAM_PKCE_INPUT_REJECTED')
  const iv = input.iv ? Buffer.from(input.iv) : randomBytes(IV_BYTES)
  if (iv.byteLength !== IV_BYTES) throw new Error('UPSTREAM_PKCE_INPUT_REJECTED')
  const cipher = createCipheriv('aes-256-gcm', input.key.material, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(pkceAad({ ...input, keyVersion: input.key.version }))
  const body = Buffer.concat([cipher.update(input.verifier, 'ascii'), cipher.final()])
  return Object.freeze({ challenge: input.challenge, ciphertext: Buffer.concat([body, cipher.getAuthTag()]), iv, keyVersion: input.key.version })
}

export function resumeDurableUpstreamLoginLeg(input: Readonly<{
  encrypted: DurableUpstreamPkce; key: UpstreamPkceVerifierKey; attemptId: string; legId: string; provider: SocialProvider; clientBindingDigest: Uint8Array
}>): string {
  assertKey(input.key)
  if (input.encrypted.keyVersion !== input.key.version || input.encrypted.iv.byteLength !== IV_BYTES || input.encrypted.ciphertext.byteLength <= TAG_BYTES) {
    throw new Error('UPSTREAM_PKCE_DECRYPTION_REJECTED')
  }
  try {
    const payload = Buffer.from(input.encrypted.ciphertext)
    const decipher = createDecipheriv('aes-256-gcm', input.key.material, input.encrypted.iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(pkceAad({ ...input, challenge: input.encrypted.challenge, keyVersion: input.key.version }))
    decipher.setAuthTag(payload.subarray(-TAG_BYTES))
    const verifier = Buffer.concat([decipher.update(payload.subarray(0, -TAG_BYTES)), decipher.final()]).toString('ascii')
    validatePkceVerifier(verifier)
    if (calculateS256Challenge(verifier) !== input.encrypted.challenge) throw new Error('challenge mismatch')
    return verifier
  } catch {
    throw new Error('UPSTREAM_PKCE_DECRYPTION_REJECTED')
  }
}

export function verifyDurableUpstreamNonce(rawNonce: string, storedDigest: Uint8Array): boolean {
  if (storedDigest.byteLength !== 32) return false
  const candidate = Buffer.from(upstreamNonceDigest(rawNonce))
  return timingSafeEqual(candidate, Buffer.from(storedDigest))
}

export function prepareDurableUpstreamLoginLeg(input: Readonly<{
  attemptId: string; provider: SocialProvider; clientId: string; redirectUri: string; pkceKey?: UpstreamPkceVerifierKey; legId?: string
}>): PreparedDurableUpstreamLoginLeg {
  assertUuid(input.attemptId); assertProvider(input.provider)
  const legId = input.legId ?? randomUUID(); assertUuid(legId)
  const rawState = randomBytes(32).toString('base64url')
  const clientBindingDigest = upstreamClientBindingDigest(input)
  if (input.provider === 'naver') {
    if (input.pkceKey !== undefined) throw new Error('UPSTREAM_LEG_INPUT_REJECTED')
    return Object.freeze({ database: Object.freeze({ legId, provider: input.provider, clientBindingDigest, stateDigest: upstreamStateDigest(rawState), nonceDigest: null, pkce: null }), authorization: Object.freeze({ rawState, rawNonce: null, pkceChallenge: null }) })
  }
  if (!input.pkceKey) throw new Error('UPSTREAM_LEG_INPUT_REJECTED')
  const rawNonce = randomBytes(32).toString('base64url')
  const verifier = createPkceVerifier(); const challenge = calculateS256Challenge(verifier)
  const pkce = encryptUpstreamPkceVerifier({ verifier, key: input.pkceKey, attemptId: input.attemptId, legId, provider: input.provider, clientBindingDigest, challenge })
  return Object.freeze({ database: Object.freeze({ legId, provider: input.provider, clientBindingDigest, stateDigest: upstreamStateDigest(rawState), nonceDigest: upstreamNonceDigest(rawNonce), pkce }), authorization: Object.freeze({ rawState, rawNonce, pkceChallenge: challenge }) })
}

export function parseDurableUpstreamCallback(input: Readonly<{ provider: SocialProvider; callbackUrl: string; redirectUri: string }>): DurableUpstreamCallback {
  assertProvider(input.provider)
  let callback: URL; let redirect: URL
  try { callback = new URL(input.callbackUrl); redirect = new URL(input.redirectUri) } catch { throw new Error('UPSTREAM_CALLBACK_REJECTED') }
  if (callback.origin !== redirect.origin || callback.pathname !== redirect.pathname || callback.hash) throw new Error('UPSTREAM_CALLBACK_REJECTED')
  for (const key of ['code', 'state']) if (callback.searchParams.getAll(key).length !== 1) throw new Error('UPSTREAM_CALLBACK_REJECTED')
  const authorizationCode = callback.searchParams.get('code')!; const rawState = callback.searchParams.get('state')!
  if (!authorizationCode || Buffer.byteLength(authorizationCode, 'utf8') > 2048 || /[\u0000-\u001f\u007f]/.test(authorizationCode)) throw new Error('UPSTREAM_CALLBACK_REJECTED')
  requireRaw(rawState)
  return Object.freeze({ provider: input.provider, authorizationCode, rawState })
}
