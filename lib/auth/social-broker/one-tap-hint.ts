import 'server-only'
import { createCipheriv, createDecipheriv, createPublicKey, createVerify, randomBytes } from 'node:crypto'
import type { BrowserSessionKey } from './browser-continuity-session'
import { GOOGLE_OIDC_METADATA, type UpstreamHttpTransport } from './upstream-adapters'

/**
 * Part 2 P2b — Google One Tap as an ACCOUNT-PICKER SHORTCUT ONLY.
 *
 * The One Tap ID token never authenticates anyone here. After a signature /
 * audience / issuer / expiry check, only its numeric Google `sub` is kept, sealed
 * in a 2-minute HttpOnly cookie, and later passed to Google as `login_hint` on the
 * ordinary redirect login. The real authority is still the broker's own Google
 * code exchange (state, nonce, PKCE, ID-token verification). Email, name and
 * picture claims are discarded immediately and never stored or logged.
 */
export const GOOGLE_LOGIN_HINT_COOKIE = Object.freeze({
  name: '__Host-schoollove-google-login-hint',
  options: Object.freeze({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 120 }),
})
const PURPOSE = 'schoollove:google-one-tap-login-hint:v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const GOOGLE_SUB = /^[0-9]{1,255}$/
const ONE_TAP_CLIENT_ID = /^[0-9]{6,32}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com'])
const MAX_CREDENTIAL_LENGTH = 4096

function fail(): never { throw new Error('ONE_TAP_HINT_REJECTED') }
const b64json = (part: string): Record<string, unknown> => {
  const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  return value as Record<string, unknown>
}

/** Accepts only a well-formed public web client ID, or null (One Tap off). */
export function oneTapClientId(value: string | undefined): string | null {
  return typeof value === 'string' && ONE_TAP_CLIENT_ID.test(value) ? value : null
}

/** Verifies a One Tap credential and returns ONLY the Google `sub`. */
export async function verifyOneTapCredential(input: Readonly<{
  credential: unknown; clientId: string; transport: Pick<UpstreamHttpTransport, 'fetchJwks'>; now: number
}>): Promise<string> {
  if (typeof input.credential !== 'string' || input.credential.length > MAX_CREDENTIAL_LENGTH || !ONE_TAP_CLIENT_ID.test(input.clientId)) fail()
  const parts = input.credential.split('.')
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) fail()
  let header: Record<string, unknown>; let claims: Record<string, unknown>
  try { header = b64json(parts[0]!); claims = b64json(parts[1]!) } catch { fail() }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 128) fail()
  const jwksResponse = await input.transport.fetchJwks({ provider: 'google', jwksUri: GOOGLE_OIDC_METADATA.jwksUri })
  if (jwksResponse.status !== 200) fail()
  let keys: unknown
  try { keys = (JSON.parse(jwksResponse.body) as { keys?: unknown }).keys } catch { fail() }
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 20) fail()
  const jwk = keys.find(value => value && typeof value === 'object' && value.kid === header.kid && value.kty === 'RSA'
    && typeof value.n === 'string' && typeof value.e === 'string' && !('d' in value)) as Record<string, string> | undefined
  if (!jwk) fail()
  let valid = false
  try {
    const publicKey = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' })
    valid = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).end().verify(publicKey, Buffer.from(parts[2]!, 'base64url'))
  } catch { fail() }
  if (!valid) fail()
  const exp = claims.exp; const iat = claims.iat; const sub = claims.sub
  if (!ISSUERS.has(claims.iss as string) || claims.aud !== input.clientId
    || typeof exp !== 'number' || exp <= input.now || typeof iat !== 'number' || iat > input.now + 60
    || typeof sub !== 'string' || !GOOGLE_SUB.test(sub)) fail()
  return sub
}

function aad(key: BrowserSessionKey): Buffer { return Buffer.from(`${PURPOSE}\0${key.version}`, 'utf8') }
function assertKey(key: BrowserSessionKey): void { if (key.version !== 1 || key.material.byteLength !== 32) fail() }

export function sealLoginHint(input: Readonly<{ sub: string; expiresAt: number }>, key: BrowserSessionKey): string {
  assertKey(key)
  if (!GOOGLE_SUB.test(input.sub) || !Number.isSafeInteger(input.expiresAt)) fail()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key.material, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(aad(key))
  const body = Buffer.concat([cipher.update(JSON.stringify({ sub: input.sub, expiresAt: input.expiresAt }), 'utf8'), cipher.final(), cipher.getAuthTag()])
  return `v1.${iv.toString('base64url')}.${body.toString('base64url')}`
}

/** Returns the sealed `sub`, or null for a missing, tampered or expired cookie. Never throws. */
export function openLoginHint(value: string | undefined, key: BrowserSessionKey, now: number): string | null {
  try {
    assertKey(key)
    if (!value) return null
    const parts = value.split('.')
    if (parts.length !== 3 || parts[0] !== 'v1') return null
    const iv = Buffer.from(parts[1]!, 'base64url'); const encrypted = Buffer.from(parts[2]!, 'base64url')
    if (iv.byteLength !== IV_BYTES || encrypted.byteLength <= TAG_BYTES) return null
    const decipher = createDecipheriv('aes-256-gcm', key.material, iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(aad(key)); decipher.setAuthTag(encrypted.subarray(-TAG_BYTES))
    const parsed = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -TAG_BYTES)), decipher.final()]).toString('utf8')) as { sub?: unknown; expiresAt?: unknown }
    if (typeof parsed.sub !== 'string' || !GOOGLE_SUB.test(parsed.sub) || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) return null
    return parsed.sub
  } catch { return null }
}

export function isGoogleLoginHint(value: unknown): value is string {
  return typeof value === 'string' && GOOGLE_SUB.test(value)
}
