import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SocialProvider } from './types'

const COOKIE_NAME = '__Host-schoollove-social-continuity'
const PURPOSE = 'schoollove:browser-bound-social-continuity:v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const RAW = /^[A-Za-z0-9_-]{43}$/
const IV = /^[A-Za-z0-9_-]{16}$/
const PROVIDERS = new Set<SocialProvider>(['google', 'kakao', 'naver'])

export type BrowserSessionKey = Readonly<{ version: 1; material: Uint8Array }>
export type BrowserContinuity = Readonly<{ provider: SocialProvider; brokerHandle: string; browserBindingSecret: string; issuedAt: number; expiresAt: number }>

function fail(): never { throw new Error('SOCIAL_BROWSER_SESSION_REJECTED') }
function aad(key: BrowserSessionKey): Buffer { return Buffer.from(`${PURPOSE}\0${key.version}`, 'utf8') }
function valid(input: BrowserContinuity): boolean {
  return PROVIDERS.has(input.provider) && RAW.test(input.brokerHandle) && RAW.test(input.browserBindingSecret)
    && Number.isSafeInteger(input.issuedAt) && Number.isSafeInteger(input.expiresAt) && input.expiresAt > input.issuedAt && input.expiresAt - input.issuedAt <= 600
}
function assertKey(key: BrowserSessionKey): void { if (key.version !== 1 || key.material.byteLength !== 32) fail() }

/** Seals opaque browser continuity; neither input is URL-visible or browser-readable. */
export function sealBrowserContinuity(input: BrowserContinuity, key: BrowserSessionKey): string {
  assertKey(key); if (!valid(input)) fail()
  const iv = randomBytes(IV_BYTES); const cipher = createCipheriv('aes-256-gcm', key.material, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(aad(key)); const body = Buffer.concat([cipher.update(JSON.stringify(input), 'utf8'), cipher.final(), cipher.getAuthTag()])
  return `v1.${iv.toString('base64url')}.${body.toString('base64url')}`
}
/** Opens only an authentic, unexpired server cookie. All failures are coarse. */
export function openBrowserContinuity(value: string | undefined, key: BrowserSessionKey, now: number): BrowserContinuity {
  assertKey(key); if (!value || !Number.isSafeInteger(now)) fail()
  const parts = value.split('.'); if (parts.length !== 3 || parts[0] !== 'v1' || !IV.test(parts[1]!) || !/^[A-Za-z0-9_-]+$/.test(parts[2]!)) fail()
  try {
    const iv = Buffer.from(parts[1]!, 'base64url'); const encrypted = Buffer.from(parts[2]!, 'base64url')
    if (iv.byteLength !== IV_BYTES || encrypted.byteLength <= TAG_BYTES || iv.toString('base64url') !== parts[1] || encrypted.toString('base64url') !== parts[2]) fail()
    const decipher = createDecipheriv('aes-256-gcm', key.material, iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(aad(key)); decipher.setAuthTag(encrypted.subarray(-TAG_BYTES))
    const parsed = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -TAG_BYTES)), decipher.final()]).toString('utf8')) as BrowserContinuity
    if (!valid(parsed) || parsed.expiresAt <= now) fail()
    return Object.freeze(parsed)
  } catch { fail() }
}
export const socialContinuityCookie = Object.freeze({ name: COOKIE_NAME, options: Object.freeze({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 600 }) })
