import type { SocialBrokerErrorCode } from './errors'

export const SOCIAL_PROVIDERS = ['kakao', 'naver', 'google'] as const
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

export function isSocialProvider(value: unknown): value is SocialProvider {
  return typeof value === 'string' && SOCIAL_PROVIDERS.some((provider) => provider === value)
}

export type VerifiedProtocolEvidence = Readonly<{
  protocol: 'oidc' | 'oauth2'
  issuer: string
  audience: string
  stateVerified: true
  pkceMethod: 'S256'
  nonceVerified: boolean
}>
export type VerifiedUpstreamIdentity = Readonly<{
  provider: SocialProvider
  upstreamSubject: Uint8Array
  issuedAt: number
  authenticationTime: number
  verifiedProtocolEvidence: VerifiedProtocolEvidence
}>

export const LOGIN_ATTEMPT_ACTIVE_STATES = [
  'created',
  'upstream_pending',
  'upstream_verified',
  'recovery_required',
  'recovery_pending',
  'recovery_verified',
  'account_decided',
  'existing_primary',
  'existing_account_match',
  'auth_principal_bound',
  'broker_code_ready',
] as const

export const LOGIN_ATTEMPT_TERMINAL_FAILURE_STATES = [
  'cancelled',
  'expired',
  'state_rejected',
  'pkce_rejected',
  'nonce_rejected',
  'provider_mismatch',
  'replay_rejected',
  'launch_blocked',
  'failed_safe',
] as const

export type LoginAttemptActiveState = (typeof LOGIN_ATTEMPT_ACTIVE_STATES)[number]
export type LoginAttemptTerminalFailureState = (typeof LOGIN_ATTEMPT_TERMINAL_FAILURE_STATES)[number]
export type LoginAttemptState = LoginAttemptActiveState | LoginAttemptTerminalFailureState | 'consumed'

export type BrokerLogEventName =
  | 'attempt_created'
  | 'provider_callback_success'
  | 'recovery_required'
  | 'broker_code_issued'
  | 'attempt_rejected'
  | 'attempt_consumed'

export type BrokerLogEvent = Readonly<{
  event: BrokerLogEventName
  attemptId: string
  provider: SocialProvider
  state: LoginAttemptState
  at: number
  reason?: SocialBrokerErrorCode
}>
