import { brokerFailure } from './errors'
import type { LoginAttemptSnapshot } from './attempt'
import type { SocialProvider } from './types'

/** Server-only orchestration contract. Implementations must call the service-only
 * database RPC boundary; it deliberately contains no provider, Auth, or HTTP client. */
export type SocialLoginAttemptStore = Readonly<{
  create(input: Readonly<{ safeAttemptId: string; provider: SocialProvider; expiresAt: number }>): Promise<LoginAttemptSnapshot>
  recordVerifiedIdentity(input: Readonly<{ attemptId: string; provider: SocialProvider; brokerSubject: string; subjectDigest: Uint8Array; subjectKeyVersion: number }>): Promise<'EXISTING_PRIMARY' | 'RECOVERY_REQUIRED'>
}>

export type SocialAccountDecision = Readonly<{ outcome: 'USE_PRIMARY_PROVIDER' | 'ACCOUNT_DECIDED'; primaryProvider: SocialProvider }>

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
