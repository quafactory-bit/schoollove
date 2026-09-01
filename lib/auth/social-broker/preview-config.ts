import 'server-only'
import { createPrivateKey, createPublicKey, timingSafeEqual, type KeyObject } from 'node:crypto'
import { createDarkOidcClient, type DarkOidcClient } from './http'
import type { VersionedKey } from '../social-account/recovery'

const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const VALUE_PATTERN = /^[^\u0000-\u001f\u007f]{1,2048}$/
const JWK_PATTERN = /^[A-Za-z0-9_-]{64,16384}$/

export const PREVIEW_BROKER_ISSUER = 'https://preview.schoollove.kr'
export const PREVIEW_SUPABASE_CALLBACK = 'https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback'
export const PRODUCTION_BROKER_ISSUER = 'https://www.schoollove.kr'
export const PRODUCTION_SUPABASE_CALLBACK = 'https://ucnybhzpbatzcipwqtox.supabase.co/auth/v1/callback'

export type BrokerExposureMode = 'off' | 'preview' | 'production-bootstrap' | 'production'
export type BrokerProfile = 'preview' | 'production'
export type BrokerActiveExposure = Exclude<BrokerExposureMode, 'off'>
export type BrokerSigningKid = 'preview-rs256-v1' | 'production-rs256-v1'

const BROKER_PROFILES = Object.freeze({
  preview: Object.freeze({
    vercelEnvironment: 'preview',
    issuer: PREVIEW_BROKER_ISSUER,
    supabaseAuthority: 'https://hukokfyphyrpfouazxhq.supabase.co',
    supabaseCallback: PREVIEW_SUPABASE_CALLBACK,
    completionRoute: `${PREVIEW_BROKER_ISSUER}/auth/social/complete`,
    downstreamClientId: 'slb-supabase-google',
    signingKid: 'preview-rs256-v1',
  }),
  production: Object.freeze({
    vercelEnvironment: 'production',
    issuer: PRODUCTION_BROKER_ISSUER,
    supabaseAuthority: 'https://ucnybhzpbatzcipwqtox.supabase.co',
    supabaseCallback: PRODUCTION_SUPABASE_CALLBACK,
    completionRoute: `${PRODUCTION_BROKER_ISSUER}/auth/social/complete`,
    downstreamClientId: 'slb-supabase-google',
    signingKid: 'production-rs256-v1',
  }),
} satisfies Readonly<Record<BrokerProfile, Readonly<{
  vercelEnvironment: BrokerProfile
  issuer: string
  supabaseAuthority: string
  supabaseCallback: string
  completionRoute: string
  downstreamClientId: string
  signingKid: BrokerSigningKid
}>>>)

export type ProviderCredential = Readonly<{ clientId: string; clientSecret: string }>
export type BrokerActiveConfig = Readonly<{
  exposure: BrokerActiveExposure
  issuer: string
  supabaseAuthority: string
  supabaseCallback: string
  completionRoute: string
  providers: Readonly<{ google: ProviderCredential }>
  downstreamClients: readonly DarkOidcClient[]
  upstreamContinuationKey: Readonly<{ version: 1; material: Uint8Array }>
  browserSessionKey: Readonly<{ version: 1; material: Uint8Array }>
  upstreamPkceKey: Readonly<{ version: 1; material: Uint8Array }>
  downstreamNonceKey: Readonly<{ version: 1; material: Uint8Array }>
  brokerSubjectKey: Readonly<{ version: 1; material: Uint8Array }>
  oidcSigningKey: Readonly<{ kid: BrokerSigningKid; privateKey: KeyObject }>
  recovery: Readonly<{
    hmacKey: VersionedKey
    encryptionKey: VersionedKey
    otpMacKey: VersionedKey
    resendApiKey: string
    emailFrom: string
  }>
}>

export type BrokerConfigResult = Readonly<{ exposure: 'off' }> | BrokerActiveConfig
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

function signingKey(env: Environment, kid: BrokerSigningKid): Readonly<{ kid: BrokerSigningKid; privateKey: KeyObject }> {
  const serialized = env.SCHOOLLOVE_SOCIAL_BROKER_OIDC_SIGNING_PRIVATE_JWK_V1
  if (!serialized) invalid()
  if (!JWK_PATTERN.test(serialized) || Buffer.from(serialized, 'base64url').toString('base64url') !== serialized) invalid()
  try {
    const jwk = JSON.parse(Buffer.from(serialized, 'base64url').toString('utf8')) as Record<string, unknown>
    if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string' || typeof jwk.d !== 'string') invalid()
    const privateKey = createPrivateKey({ key: jwk, format: 'jwk' })
    const publicJwk = createPublicKey(privateKey).export({ format: 'jwk' }) as Record<string, unknown>
    if (publicJwk.kty !== 'RSA' || typeof publicJwk.n !== 'string' || typeof publicJwk.e !== 'string') invalid()
    return Object.freeze({ kid, privateKey })
  } catch { invalid() }
}

/**
 * The only environment-controlled exposure switch. `off` is the unconditional
 * default. Preview and Production profiles must match the server-owned Vercel
 * deployment environment exactly; request data never selects a profile.
 * Values are returned only to server-only callers and are never logged.
 */
export function loadBrokerConfig(env: Environment = process.env): BrokerConfigResult {
  const mode = env.SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE ?? 'off'
  if (mode === 'off') return Object.freeze({ exposure: 'off' })
  if (mode !== 'preview' && mode !== 'production-bootstrap' && mode !== 'production') invalid()
  const profileName: BrokerProfile = mode === 'production-bootstrap' ? 'production' : mode
  const profile = BROKER_PROFILES[profileName]
  if (env.VERCEL_ENV !== profile.vercelEnvironment) invalid()
  const providers = Object.freeze({ google: Object.freeze({ clientId: required(env, 'SCHOOLLOVE_GOOGLE_CLIENT_ID'), clientSecret: required(env, 'SCHOOLLOVE_GOOGLE_CLIENT_SECRET') }) })
  const downstreamClients = Object.freeze([createDarkOidcClient(profile.downstreamClientId, required(env, 'SCHOOLLOVE_SUPABASE_GOOGLE_CLIENT_SECRET'), profile.supabaseCallback, 'google')])
  const upstreamContinuationKey = key(env, 'SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_CONTINUATION_KEY_V1')
  const browserSessionKey = key(env, 'SCHOOLLOVE_SOCIAL_BROKER_BROWSER_SESSION_KEY_V1')
  const upstreamPkceKey = key(env, 'SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_PKCE_KEY_V1')
  const downstreamNonceKey = key(env, 'SCHOOLLOVE_SOCIAL_BROKER_DOWNSTREAM_NONCE_KEY_V1')
  const brokerSubjectKey = key(env, 'SCHOOLLOVE_SOCIAL_BROKER_SUBJECT_KEY_K01')
  const recovery = Object.freeze({
    hmacKey: key(env, 'SCHOOLLOVE_RECOVERY_EMAIL_HMAC_KEY_V1'),
    encryptionKey: key(env, 'SCHOOLLOVE_RECOVERY_EMAIL_ENCRYPTION_KEY_V1'),
    otpMacKey: key(env, 'SCHOOLLOVE_RECOVERY_OTP_MAC_KEY_V1'),
    resendApiKey: required(env, 'SCHOOLLOVE_RECOVERY_RESEND_API_KEY'),
    emailFrom: required(env, 'SCHOOLLOVE_RECOVERY_EMAIL_FROM'),
  })
  const separated = [upstreamContinuationKey, browserSessionKey, upstreamPkceKey, downstreamNonceKey, brokerSubjectKey, recovery.hmacKey, recovery.encryptionKey, recovery.otpMacKey]
  if (new Set(separated.map(value => Buffer.from(value.material).toString('hex'))).size !== separated.length) invalid()
  return Object.freeze({
    exposure: mode,
    issuer: profile.issuer,
    supabaseAuthority: profile.supabaseAuthority,
    supabaseCallback: profile.supabaseCallback,
    completionRoute: profile.completionRoute,
    providers,
    upstreamContinuationKey,
    browserSessionKey,
    upstreamPkceKey,
    downstreamNonceKey,
    brokerSubjectKey,
    downstreamClients,
    oidcSigningKey: signingKey(env, profile.signingKid),
    recovery,
  })
}

/**
 * Browser-facing login is deliberately narrower than issuer exposure. Production
 * bootstrap serves the OIDC authority for provider validation, but must not create
 * an upstream login attempt or expose recovery/completion surfaces.
 */
export function loadUserLoginBrokerConfig(env: Environment = process.env): BrokerActiveConfig | null {
  try {
    const config = loadBrokerConfig(env)
    return config.exposure === 'preview' || config.exposure === 'production' ? config : null
  } catch { return null }
}

export const PROVIDER_CALLBACK_PATHS = Object.freeze({ google: '/auth/social/callback/google' })
export const BROKER_PUBLIC_PATHS = Object.freeze({
  discovery: '/.well-known/openid-configuration', jwks: '/.well-known/jwks.json', authorize: '/oauth/authorize', token: '/oauth/token',
})
