import 'server-only'
import type { DarkBrokerPersistence, DurableContinuationCreate, DurableContinuationResult } from './dark-orchestrator'
import type { ClaimByState } from './callback-correlation'
import type { TrustedAuthorizationTransactionIssuanceContext } from './transaction-bound-code-issuance'
import type { SocialProvider } from './types'
import type { PreparedAttemptRecoveryChallenge } from '../social-account/recovery-preparation'
import type { RecoveryDeliveryDatabase } from '../social-account/recovery-delivery'
import type { SocialAccountDecision } from './decision'

/** Minimal server-side RPC port. It deliberately has no table access. */
export type PreviewRpcClient = Readonly<{
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<Readonly<{ data: unknown; error: unknown }>>
}>

type Row = Record<string, unknown>
const bytea = (value: Uint8Array | null): string | null => value === null ? null : `\\x${Buffer.from(value).toString('hex')}`
const first = (value: unknown): Row | null => Array.isArray(value) ? (value[0] as Row | undefined) ?? null : (value as Row | null)
const text = (value: unknown): string | null => typeof value === 'string' ? value : null
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isInteger(value) ? value : null
function bytes(value: unknown): Uint8Array | null {
  if (typeof value !== 'string') return null
  try {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex')
    return Buffer.from(value, 'base64')
  } catch { return null }
}
async function rpc(client: PreviewRpcClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await Promise.resolve(client.rpc(name, args))
  if (result.error) throw new Error('SOCIAL_BROKER_PERSISTENCE_REJECTED')
  return result.data
}
const expiresAt = (seconds: number) => new Date(seconds * 1000).toISOString()

function continuation(data: unknown): DurableContinuationResult {
  const row = first(data)
  if (!row) return { outcome: 'CORRELATION_REJECTED', transactionId: null, attemptId: null, provider: null, clientId: null, redirectUri: null, legId: null, clientBindingDigest: null, stateDigest: null, nonceDigest: null, pkceS256Challenge: null, pkceVerifierCiphertext: null, pkceVerifierIv: null, pkceVerifierKeyVersion: null, continuationCiphertext: null, continuationIv: null, continuationKeyVersion: null }
  const outcome = text(row.outcome)
  if (!outcome || !['CONTINUATION_PENDING', 'CONTINUATION_BOUND', 'CONTINUATION_RESUMED', 'CORRELATION_REJECTED', 'EXPIRED'].includes(outcome)) throw new Error('SOCIAL_BROKER_PERSISTENCE_REJECTED')
  const provider = text(row.provider)
  if (provider !== null && provider !== 'google' && provider !== 'kakao' && provider !== 'naver') throw new Error('SOCIAL_BROKER_PERSISTENCE_REJECTED')
  return Object.freeze({
    outcome: outcome as DurableContinuationResult['outcome'], transactionId: text(row.transaction_id), attemptId: text(row.attempt_id), provider: provider as SocialProvider | null,
    clientId: text(row.client_id), redirectUri: text(row.redirect_uri), legId: text(row.leg_id), clientBindingDigest: bytes(row.client_binding_digest), stateDigest: bytes(row.state_digest), nonceDigest: bytes(row.nonce_digest),
    pkceS256Challenge: text(row.pkce_s256_challenge), pkceVerifierCiphertext: bytes(row.pkce_verifier_ciphertext), pkceVerifierIv: bytes(row.pkce_verifier_iv), pkceVerifierKeyVersion: integer(row.pkce_verifier_key_version),
    continuationCiphertext: bytes(row.continuation_ciphertext), continuationIv: bytes(row.continuation_iv), continuationKeyVersion: integer(row.continuation_key_version),
  })
}

/** Maps only the approved service-RPC signatures; direct private CRUD is impossible here. */
export function createPreviewBrokerPersistence(client: PreviewRpcClient): DarkBrokerPersistence {
  const claimCallback: ClaimByState = async input => {
    const row = first(await rpc(client, 'claim_upstream_login_callback_by_state', { requested_provider: input.provider, requested_client_binding_digest: bytea(input.clientBindingDigest), submitted_state_digest: bytea(input.stateDigest) }))
    return Object.freeze({ outcome: text(row?.outcome) ?? 'CORRELATION_REJECTED', attemptId: text(row?.attempt_id), legId: text(row?.leg_id), provider: text(row?.provider) as SocialProvider | null, nonceDigest: bytes(row?.nonce_digest), pkceS256Challenge: text(row?.pkce_s256_challenge), pkceVerifierCiphertext: bytes(row?.pkce_verifier_ciphertext), pkceVerifierIv: bytes(row?.pkce_verifier_iv), pkceVerifierKeyVersion: integer(row?.pkce_verifier_key_version) })
  }
  return Object.freeze({
    async createAttempt(input) {
      const result = await rpc(client, 'create_social_login_attempt', { requested_safe_attempt_id: input.safeAttemptId, requested_provider: input.provider, requested_expires_at: expiresAt(input.expiresAt) })
      if (typeof result !== 'string') throw new Error('SOCIAL_BROKER_PERSISTENCE_REJECTED')
      return result
    },
    async createTransaction(input) {
      const row = first(await rpc(client, 'create_downstream_authorization_transaction', { requested_transaction_id: input.transactionId, target_attempt_id: input.loginAttemptId, requested_handle_digest: bytea(input.brokerHandleDigest), requested_client_id: input.clientId, requested_redirect_uri: input.redirectUri, requested_response_type: input.responseType, requested_scopes: input.requestedScopes, requested_pkce_s256_challenge: input.pkceS256Challenge, requested_pkce_method: input.pkceMethod, requested_downstream_nonce: input.downstreamNonce, requested_downstream_state: input.downstreamState, requested_expires_at: expiresAt(input.expiresAt) }))
      if (text(row?.outcome) !== 'TRANSACTION_CREATED') throw new Error('SOCIAL_BROKER_PERSISTENCE_REJECTED')
      return 'TRANSACTION_CREATED'
    },
    async resolveDurableContinuation(handleDigest) { return continuation(await rpc(client, 'resolve_durable_continuation_by_digest', { requested_continuation_digest: bytea(handleDigest) })) },
    async createOrResumeDurableContinuation(input: DurableContinuationCreate) {
      const pkce = input.leg.pkce
      return continuation(await rpc(client, 'create_or_resume_durable_upstream_continuation', { requested_continuation_digest: bytea(input.continuationDigest), requested_leg_id: input.leg.legId, requested_provider: input.leg.provider, requested_client_binding_digest: bytea(input.leg.clientBindingDigest), requested_state_digest: bytea(input.leg.stateDigest), requested_nonce_digest: bytea(input.leg.nonceDigest), requested_pkce_s256_challenge: pkce?.challenge ?? null, requested_pkce_verifier_ciphertext: bytea(pkce?.ciphertext ?? null), requested_pkce_verifier_iv: bytea(pkce?.iv ?? null), requested_pkce_verifier_key_version: pkce?.keyVersion ?? null, requested_continuation_ciphertext: bytea(input.continuation.ciphertext), requested_continuation_iv: bytea(input.continuation.iv), requested_continuation_key_version: input.continuation.keyVersion }))
    },
    claimCallback,
    async failClaimedUpstreamLeg(input) {
      const result = await rpc(client, 'fail_upstream_login_leg', { target_attempt_id: input.attemptId, target_leg_id: input.legId, reason: input.reason })
      return result === 'EXPIRED' ? 'EXPIRED' : result === 'REPLAY_REJECTED' ? 'REPLAY_REJECTED' : 'REJECTED'
    },
    async recordVerifiedIdentity(input) {
      const result = await rpc(client, 'record_verified_social_identity_from_upstream_leg', { target_attempt_id: input.attemptId, target_leg_id: input.legId, requested_provider: input.provider, requested_broker_subject: input.brokerSubject, requested_subject_digest: bytea(input.subjectDigest), requested_subject_key_version: input.subjectKeyVersion })
      return ['EXISTING_PRIMARY', 'RECOVERY_REQUIRED', 'PROVISIONAL_RESUME_READY', 'BOUND_PROVISIONAL_REAUTH_READY', 'IDENTITY_DECISION_IN_PROGRESS', 'IDENTITY_REJECTED'].includes(result as string) ? result as 'EXISTING_PRIMARY' | 'RECOVERY_REQUIRED' | 'PROVISIONAL_RESUME_READY' | 'BOUND_PROVISIONAL_REAUTH_READY' | 'IDENTITY_DECISION_IN_PROGRESS' | 'IDENTITY_REJECTED' : 'IDENTITY_REJECTED'
    },
    async resolveIssuanceContext(attemptId): Promise<TrustedAuthorizationTransactionIssuanceContext | null> {
      const row = first(await rpc(client, 'get_transaction_bound_broker_code_issuance_context', { target_attempt_id: attemptId }))
      const authorizationTransactionId = text(row?.authorization_transaction_id); const loginAttemptId = text(row?.login_attempt_id); const clientId = text(row?.client_id); const redirectUri = text(row?.redirect_uri); const pkceS256Challenge = text(row?.pkce_s256_challenge)
      return authorizationTransactionId && loginAttemptId && clientId && redirectUri && pkceS256Challenge ? Object.freeze({ authorizationTransactionId, loginAttemptId, clientId, redirectUri, pkceS256Challenge, downstreamNonce: text(row?.downstream_nonce), downstreamState: text(row?.downstream_state) }) : null
    },
    async issueTransactionBoundCode(input) {
      const nonce = input.code.downstreamNonce
      const row = first(await rpc(client, 'issue_transaction_bound_broker_authorization_code', { target_transaction_id: input.authorizationTransactionId, requested_code_id: input.code.codeId, requested_code_digest: bytea(input.code.codeDigest), requested_authentication_time: input.code.authenticationTime, requested_downstream_nonce: input.downstreamNonceProof, requested_downstream_nonce_digest: bytea(nonce?.digest ?? null), requested_downstream_nonce_ciphertext: bytea(nonce?.ciphertext ?? null), requested_downstream_nonce_iv: bytea(nonce?.iv ?? null), requested_downstream_nonce_key_version: nonce?.keyVersion ?? null }))
      return text(row?.outcome) === 'AUTHORIZATION_CODE_CREATED' ? 'AUTHORIZATION_CODE_CREATED' : 'AUTHORIZATION_CODE_REJECTED'
    },
  })
}

export function createPreviewCodeConsumer(client: PreviewRpcClient) {
  return async (input: Readonly<{ codeDigest: Uint8Array; clientId: string; redirectUri: string; pkceS256Challenge: string }>) => {
    const row = first(await rpc(client, 'consume_broker_authorization_code', { requested_code_digest: bytea(input.codeDigest), requested_client_id: input.clientId, requested_redirect_uri: input.redirectUri, requested_pkce_s256_challenge: input.pkceS256Challenge }))
    if (text(row?.outcome) !== 'AUTHORIZATION_CODE_CONSUMED') return null
    const subject = text(row?.broker_subject); const authenticationTime = integer(row?.authentication_time); const codeId = text(row?.code_id)
    if (!subject || authenticationTime === null || !codeId) throw new Error('SOCIAL_BROKER_PERSISTENCE_REJECTED')
    const digest = bytes(row?.downstream_nonce_digest); const ciphertext = bytes(row?.downstream_nonce_ciphertext); const iv = bytes(row?.downstream_nonce_iv); const keyVersion = integer(row?.downstream_nonce_key_version)
    const downstreamNonce = digest && ciphertext && iv && keyVersion !== null ? Object.freeze({ digest, ciphertext, iv, keyVersion }) : null
    return Object.freeze({ outcome: 'AUTHORIZATION_CODE_CONSUMED' as const, subject, authenticationTime, codeId, downstreamNonce })
  }
}

/** Recovery adapter sends only crypto envelopes and IDs through service RPCs. */
export function createPreviewRecoveryDatabase(client: PreviewRpcClient): RecoveryDeliveryDatabase {
  return Object.freeze({
    async createAndReserve(input: PreparedAttemptRecoveryChallenge['database'] & Readonly<{ attemptId: string }>) {
      const row = first(await rpc(client, 'create_and_reserve_login_attempt_recovery_delivery', {
        target_attempt_id: input.attemptId,
        requested_verification_id: input.challengeId,
        requested_reserved_account_id: input.reservedAccountId,
        requested_hmac: bytea(input.recoveryEmailHmac),
        requested_hmac_key_version: input.recoveryEmailHmacKeyVersion,
        requested_ciphertext: bytea(input.destinationCiphertext),
        requested_nonce: bytea(input.destinationNonce),
        requested_encryption_key_version: input.encryptionKeyVersion,
        requested_otp_mac: bytea(input.otpMac),
        requested_otp_key_version: input.otpKeyVersion,
      }))
      const outcome = text(row?.outcome)
      if (outcome === 'RECOVERY_DELIVERY_LIMITED') return Object.freeze({ outcome })
      const verificationId = text(row?.verification_id); const deliveryId = text(row?.delivery_id)
      if ((outcome !== 'RECOVERY_DELIVERY_RESERVED' && outcome !== 'RECOVERY_DELIVERY_ALREADY_SENT') || !verificationId || !deliveryId) throw new Error('SOCIAL_RECOVERY_PERSISTENCE_REJECTED')
      return Object.freeze({ outcome, verificationId, deliveryId })
    },
    async markSent(deliveryId: string) {
      if (await rpc(client, 'mark_login_attempt_recovery_delivery_sent', { target_delivery_id: deliveryId }) !== 'RECOVERY_DELIVERY_SENT') throw new Error('SOCIAL_RECOVERY_PERSISTENCE_REJECTED')
    },
    async fail(deliveryId: string) {
      if (await rpc(client, 'fail_login_attempt_recovery_delivery', { target_delivery_id: deliveryId }) !== 'RECOVERY_DELIVERY_FAILED') throw new Error('SOCIAL_RECOVERY_PERSISTENCE_REJECTED')
    },
  })
}

export async function consumePreviewRecoveryDecision(client: PreviewRpcClient, input: Readonly<{ attemptId: string; verificationId: string; otpMac: Uint8Array }>): Promise<SocialAccountDecision> {
  const row = first(await rpc(client, 'consume_recovery_and_decide_social_account', {
    target_attempt_id: input.attemptId,
    target_verification_id: input.verificationId,
    submitted_otp_mac: bytea(input.otpMac),
  }))
  const outcome = text(row?.outcome) as SocialAccountDecision['outcome'] | null
  const primaryProvider = text(row?.primary_provider)
  if (outcome && ['ACCOUNT_DECIDED', 'USE_PRIMARY_PROVIDER', 'EXISTING_PRIMARY'].includes(outcome) && (primaryProvider === 'google' || primaryProvider === 'kakao' || primaryProvider === 'naver')) {
    return Object.freeze({ outcome: outcome as 'ACCOUNT_DECIDED' | 'USE_PRIMARY_PROVIDER' | 'EXISTING_PRIMARY', primaryProvider })
  }
  if (outcome && ['ACCOUNT_DECISION_IN_PROGRESS', 'IDENTITY_DECISION_IN_PROGRESS', 'ACCOUNT_UNAVAILABLE', 'EXPIRED', 'OTP_REJECTED', 'LOCKED'].includes(outcome)) {
    return Object.freeze({ outcome: outcome as 'ACCOUNT_DECISION_IN_PROGRESS' | 'IDENTITY_DECISION_IN_PROGRESS' | 'ACCOUNT_UNAVAILABLE' | 'EXPIRED' | 'OTP_REJECTED' | 'LOCKED', primaryProvider: null })
  }
  throw new Error('SOCIAL_RECOVERY_PERSISTENCE_REJECTED')
}

export async function bindPreviewAuthPrincipal(client: PreviewRpcClient, input: Readonly<{ attemptId: string; authUserId: string }>): Promise<'AUTH_PRINCIPAL_BOUND' | 'AUTH_PRINCIPAL_ALREADY_BOUND'> {
  const result = await rpc(client, 'bind_social_auth_principal_from_attempt', { target_attempt_id: input.attemptId, target_auth_user_id: input.authUserId })
  if (result !== 'AUTH_PRINCIPAL_BOUND' && result !== 'AUTH_PRINCIPAL_ALREADY_BOUND') throw new Error('SOCIAL_PRINCIPAL_BINDING_REJECTED')
  return result
}

export async function activatePreviewSocialAccountFromAttempt(client: PreviewRpcClient, attemptId: string): Promise<'SOCIAL_ACCOUNT_ACTIVATED' | 'SOCIAL_ACCOUNT_ALREADY_ACTIVE' | 'SOCIAL_ACCOUNT_LAUNCH_CLOSED' | 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'> {
  const result = await rpc(client, 'activate_social_account_from_attempt', { target_attempt_id: attemptId })
  if (!['SOCIAL_ACCOUNT_ACTIVATED', 'SOCIAL_ACCOUNT_ALREADY_ACTIVE', 'SOCIAL_ACCOUNT_LAUNCH_CLOSED', 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'].includes(result as string)) throw new Error('SOCIAL_ACCOUNT_ACTIVATION_REJECTED')
  return result as 'SOCIAL_ACCOUNT_ACTIVATED' | 'SOCIAL_ACCOUNT_ALREADY_ACTIVE' | 'SOCIAL_ACCOUNT_LAUNCH_CLOSED' | 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'
}
