import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import type { SocialProvider } from './types'

const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const VALUE_PATTERN = /^[^\u0000-\u001f\u007f]{1,2048}$/

export type BrokerExposureMode = 'off' | 'preview'
export type ProviderCredential = Readonly<{ clientId: string; clientSecret: string }>
export type BrokerPreviewConfig = Readonly<{
  exposure: 'preview'
  providers: Readonly<Record<SocialProvider, ProviderCredential>>
  upstreamContinuationKey: Readonly<{ version: 1; material: Uint8Array }>
  browserSessionKey: Readonly<{ version: 1; material: Uint8Array }>
}>

export type BrokerConfigResult = Readonly<{ exposure: 'off' }> | BrokerPreviewConfig
export type Environment = Readonly<Record<string, string | undefined>>

function invalid(): never { throw new Error('SOCIAL_BROKER_CONFIG_INVALID') }
function required(env: Environment, name: string): string {
  const value = env[name]
  if (!value || !VALUE_PATTERN.test(value)) invalid()
  return value
}
function key(env: Environment, name: string): Readonly<{ version: 1; material: Uint8Array }> {
  const value = required(env, name)
  if (!KEY_PATTERN.test(value)) invalid()
  const material = Buffer.from(value, 'base64url')
  if (material.byteLength !== 32 || !timingSafeEqual(material, Buffer.from(material.toString('base64url'), 'base64url'))) invalid()
  return Object.freeze({ version: 1, material })
}

/**
 * The only environment-controlled exposure switch. `off` is the unconditional
 * default; Production refuses `preview` even if an operator accidentally sets it.
 * Values are returned only to server-only callers and are never logged.
 */
export function loadBrokerPreviewConfig(env: Environment = process.env): BrokerConfigResult {
  const mode = env.SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE ?? 'off'
  if (mode === 'off') return Object.freeze({ exposure: 'off' })
  if (mode !== 'preview' || env.VERCEL_ENV === 'production') invalid()
  const providers = Object.freeze({
    google: Object.freeze({ clientId: required(env, 'SCHOOLLOVE_GOOGLE_CLIENT_ID'), clientSecret: required(env, 'SCHOOLLOVE_GOOGLE_CLIENT_SECRET') }),
    kakao: Object.freeze({ clientId: required(env, 'SCHOOLLOVE_KAKAO_CLIENT_ID'), clientSecret: required(env, 'SCHOOLLOVE_KAKAO_CLIENT_SECRET') }),
    naver: Object.freeze({ clientId: required(env, 'SCHOOLLOVE_NAVER_CLIENT_ID'), clientSecret: required(env, 'SCHOOLLOVE_NAVER_CLIENT_SECRET') }),
  })
  return Object.freeze({
    exposure: 'preview', providers,
    upstreamContinuationKey: key(env, 'SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_CONTINUATION_KEY_V1'),
    browserSessionKey: key(env, 'SCHOOLLOVE_SOCIAL_BROKER_BROWSER_SESSION_KEY_V1'),
  })
}

export const PROVIDER_CALLBACK_PATHS: Readonly<Record<SocialProvider, string>> = Object.freeze({
  google: '/auth/social/callback/google', kakao: '/auth/social/callback/kakao', naver: '/auth/social/callback/naver',
})
export const BROKER_PUBLIC_PATHS = Object.freeze({
  discovery: '/.well-known/openid-configuration', jwks: '/.well-known/jwks.json', authorize: '/oauth/authorize', token: '/oauth/token',
})
