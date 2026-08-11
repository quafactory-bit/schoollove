import { brokerFailure } from './errors'
import type { LoginAttemptSnapshot } from './attempt'
import type { SocialProvider } from './types'

/** Server-only orchestration contract. Implementations must call the service-only
 * database RPC boundary; it deliberately contains no provider, Auth, or HTTP client. */
export type SocialLoginAttemptStore = Readonly<{
  create(input: Readonly<{ safeAttemptId: string; provider: SocialProvider; expiresAt: number }>): Promise<LoginAttemptSnapshot>
  recordVerifiedIdentity(input: Readonly<{ attemptId: string; provider: SocialProvider; brokerSubject: string; subjectDigest: Uint8Array; subjectKeyVersion: number }>): Promise<'EXISTING_PRIMARY' | 'RECOVERY_REQUIRED' | 'IDENTITY_DECISION_IN_PROGRESS'>
}>

export type SocialAccountDecision =
  | Readonly<{ outcome: 'ACCOUNT_DECIDED' | 'USE_PRIMARY_PROVIDER' | 'EXISTING_PRIMARY'; primaryProvider: SocialProvider }>
  | Readonly<{ outcome: 'ACCOUNT_DECISION_IN_PROGRESS' | 'IDENTITY_DECISION_IN_PROGRESS' | 'ACCOUNT_UNAVAILABLE' | 'EXPIRED' | 'OTP_REJECTED' | 'LOCKED'; primaryProvider: null }>

export type SocialAccountDecisionService = Readonly<{
  consumeRecoveryAndDecide(input: Readonly<{ attemptId: string; challengeId: string; submittedOtpMac: Uint8Array }>): Promise<SocialAccountDecision>
}>

/** Fake-only in-memory adapter for broker tests. It cannot bind an Auth user,
 * issue a broker code, contact a provider, or create a service account. */
export class InMemorySocialAccountDecisionService implements SocialAccountDecisionService {
  async consumeRecoveryAndDecide(): Promise<SocialAccountDecision> {
    brokerFailure('INVALID_ATTEMPT_TRANSITION')
  }
}
