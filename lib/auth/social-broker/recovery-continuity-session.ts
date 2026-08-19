import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { BrowserSessionKey } from './browser-continuity-session'
import type { SocialProvider } from './types'

const IV_BYTES = 12
const TAG_BYTES = 16
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SUBJECT = /^slb:v1:k[0-9]{2}:(google|kakao|naver):[A-Za-z0-9_-]{43}$/
const PROVIDERS = new Set<SocialProvider>(['google', 'kakao', 'naver'])

export type RecoveryContinuity = Readonly<{
  stage: 'recovery_required' | 'otp_sent' | 'downstream_finalized'
  provider: SocialProvider
  trustedAttemptId: string
  brokerSubject: string
  authenticationTime: number
  verificationId: string | null
  issuedAt: number
  expiresAt: number
}>

function reject(): never { throw new Error('SOCIAL_RECOVERY_CONTINUITY_REJECTED') }
function purpose(stage: RecoveryContinuity['stage'], key: BrowserSessionKey): Buffer {
  return Buffer.from(`schoollove:social-recovery-continuity:v1\0${stage}\0${key.version}`, 'utf8')
}
function valid(value: RecoveryContinuity): boolean {
  return ['recovery_required', 'otp_sent', 'downstream_finalized'].includes(value.stage)
    && PROVIDERS.has(value.provider) && UUID.test(value.trustedAttemptId) && SUBJECT.test(value.brokerSubject)
    && (value.verificationId === null || UUID.test(value.verificationId))
    && (value.stage === 'otp_sent' ? value.verificationId !== null : value.verificationId === null)
    && Number.isSafeInteger(value.authenticationTime) && value.authenticationTime >= 0
    && Number.isSafeInteger(value.issuedAt) && Number.isSafeInteger(value.expiresAt)
    && value.expiresAt > value.issuedAt && value.expiresAt - value.issuedAt <= 600
}

export function sealRecoveryContinuity(value: RecoveryContinuity, key: BrowserSessionKey): string {
  if (key.version !== 1 || key.material.byteLength !== 32 || !valid(value)) reject()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key.material, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(purpose(value.stage, key))
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()])
  return `v1.${value.stage}.${iv.toString('base64url')}.${body.toString('base64url')}`
}

export function openRecoveryContinuity(raw: string | undefined, key: BrowserSessionKey, now: number): RecoveryContinuity {
  if (!raw || key.version !== 1 || key.material.byteLength !== 32 || !Number.isSafeInteger(now)) reject()
  const parts = raw.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1' || !['recovery_required', 'otp_sent', 'downstream_finalized'].includes(parts[1]!) || !/^[A-Za-z0-9_-]+$/.test(parts[2]!) || !/^[A-Za-z0-9_-]+$/.test(parts[3]!)) reject()
  try {
    const iv = Buffer.from(parts[2]!, 'base64url'); const encrypted = Buffer.from(parts[3]!, 'base64url')
    if (iv.byteLength !== IV_BYTES || encrypted.byteLength <= TAG_BYTES || iv.toString('base64url') !== parts[2] || encrypted.toString('base64url') !== parts[3]) reject()
    const decipher = createDecipheriv('aes-256-gcm', key.material, iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(purpose(parts[1] as RecoveryContinuity['stage'], key)); decipher.setAuthTag(encrypted.subarray(-TAG_BYTES))
    const value = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -TAG_BYTES)), decipher.final()]).toString('utf8')) as RecoveryContinuity
    if (!valid(value) || value.stage !== parts[1] || value.expiresAt <= now) reject()
    return Object.freeze(value)
  } catch { reject() }
}

export const recoveryContinuityCookie = Object.freeze({
  name: '__Host-schoollove-social-recovery',
  options: Object.freeze({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 600 }),
})
