import 'server-only'
import { randomBytes } from 'node:crypto'
import { prepareBrowserBoundDownstreamAuthorizationTransaction, downstreamAuthorizationBoundHandleDigest, type PreparedDownstreamAuthorizationTransaction } from './authorization-transaction'
import { correlateUpstreamCallback, type ClaimByState, type UpstreamCallbackRegistry } from './callback-correlation'
import { prepareDurableUpstreamLoginLeg, upstreamNonceDigest, upstreamStateDigest, type PreparedDurableUpstreamLoginLeg, type UpstreamPkceVerifierKey } from './durable-upstream-leg'
import { decryptUpstreamContinuation, encryptUpstreamContinuation, type UpstreamContinuationRecoveryKey } from './durable-continuation-recovery'
import { validateDownstreamAuthorizationRequest, type DarkOidcClient, type ValidatedDownstreamAuthorizationRequest } from './http'
import { prepareTransactionBoundBrokerCode, type TrustedAuthorizationTransactionIssuanceContext } from './transaction-bound-code-issuance'
import type { BrokerAuthorizationCodeNonceKey } from './durable-code'
import { deriveBrokerSubject } from './subject'
import { SocialBrokerError } from './errors'
import type { SocialProvider } from './types'

/** Deliberately narrow service-RPC port; implementations must not use direct private-table SQL. */
export type DarkBrokerPersistence = Readonly<{
  createAttempt(input: Readonly<{ safeAttemptId: string; provider: SocialProvider; expiresAt: number }>): Promise<string>
  createTransaction(input: PreparedDownstreamAuthorizationTransaction['database']): Promise<'TRANSACTION_CREATED'>
  resolveDurableContinuation(handleDigest: Uint8Array): Promise<DurableContinuationResult>
  createOrResumeDurableContinuation(input: DurableContinuationCreate): Promise<DurableContinuationResult>
  claimCallback: ClaimByState
  failClaimedUpstreamLeg(input: Readonly<{ attemptId: string; legId: string; reason: 'provider_failure' | 'identity_failure' | 'expired' }>): Promise<'REJECTED' | 'EXPIRED' | 'REPLAY_REJECTED'>
  recordVerifiedIdentity(input: Readonly<{ attemptId: string; legId: string; provider: SocialProvider; brokerSubject: string; subjectDigest: Uint8Array; subjectKeyVersion: number }>): Promise<'EXISTING_PRIMARY' | 'RECOVERY_REQUIRED' | 'IDENTITY_DECISION_IN_PROGRESS' | 'IDENTITY_REJECTED'>
  resolveIssuanceContext(attemptId: string): Promise<TrustedAuthorizationTransactionIssuanceContext | null>
  issueTransactionBoundCode(input: ReturnType<typeof prepareTransactionBoundBrokerCode>['database']): Promise<'AUTHORIZATION_CODE_CREATED' | 'AUTHORIZATION_CODE_REJECTED'>
}>

export type TrustedUpstreamClient = Readonly<{ clientId: string; redirectUri: string }>
export type DarkUpstreamConfiguration = Readonly<Record<SocialProvider, TrustedUpstreamClient>>
export type DarkOrchestratorKeys = Readonly<{ upstreamPkce: UpstreamPkceVerifierKey; upstreamContinuation: UpstreamContinuationRecoveryKey; downstreamNonce: BrokerAuthorizationCodeNonceKey; brokerSubject: Uint8Array; brokerSubjectKeyVersion: number }>

/** Canonical S RPC response. IDs arrive only from service RPC output, never browser input. */
export type DurableContinuationResult = Readonly<{
  outcome: 'CONTINUATION_PENDING' | 'CONTINUATION_BOUND' | 'CONTINUATION_RESUMED' | 'CORRELATION_REJECTED' | 'EXPIRED'
  transactionId: string | null
  attemptId: string | null
  provider: SocialProvider | null
  clientId: string | null
  redirectUri: string | null
  legId: string | null
  clientBindingDigest: Uint8Array | null
  stateDigest: Uint8Array | null
  nonceDigest: Uint8Array | null
  pkceS256Challenge: string | null
  pkceVerifierCiphertext: Uint8Array | null
  pkceVerifierIv: Uint8Array | null
  pkceVerifierKeyVersion: number | null
  continuationCiphertext: Uint8Array | null
  continuationIv: Uint8Array | null
  continuationKeyVersion: number | null
}>

export type DurableContinuationCreate = Readonly<{
  continuationDigest: Uint8Array
  leg: PreparedDurableUpstreamLoginLeg['database']
  continuation: Readonly<{ ciphertext: Uint8Array; iv: Uint8Array; keyVersion: number }>
}>
/** Provider verification consumes only the callback-correlated durable context, never browser IDs. */
export type DurableProviderVerifier = Readonly<{
  verify(input: Readonly<{ provider: SocialProvider; authorizationCode: string; rawState: string; attemptId: string; legId: string; nonceDigest: Uint8Array | null; pkce: Readonly<{ challenge: string; ciphertext: Uint8Array; iv: Uint8Array; keyVersion: number }> | null }>): Promise<Readonly<{ provider: SocialProvider; upstreamSubject: Uint8Array; authenticationTime: number }>>
}>

const safeAttemptId = () => `att_${randomBytes(18).toString('base64url')}`
/** Server-only dark lifecycle. It returns opaque browser continuity only; no public route instantiates it. */
export class DarkBrokerOrchestrator {
  readonly input: Readonly<{ clients: readonly DarkOidcClient[]; persistence: DarkBrokerPersistence; upstream: DarkUpstreamConfiguration; keys: DarkOrchestratorKeys; now: () => number }>
  constructor(input: Readonly<{ clients: readonly DarkOidcClient[]; persistence: DarkBrokerPersistence; upstream: DarkUpstreamConfiguration; keys: DarkOrchestratorKeys; now: () => number }>) { this.input = input }

  validate(url: URL): ValidatedDownstreamAuthorizationRequest { return validateDownstreamAuthorizationRequest({ url, clients: this.input.clients }) }

  async begin(url: URL): Promise<Readonly<{ provider: SocialProvider; brokerHandle: string; browserBindingSecret: string }>> {
    const request = this.validate(url); const now = this.input.now(); const expiresAt = now + 600
    const attemptId = await this.input.persistence.createAttempt({ safeAttemptId: safeAttemptId(), provider: request.provider, expiresAt })
    const prepared = prepareBrowserBoundDownstreamAuthorizationTransaction({ loginAttemptId: attemptId, clientId: request.clientId, redirectUri: request.redirectUri, scopes: request.scopes, pkceS256Challenge: request.pkceS256Challenge, downstreamState: request.downstreamState, ...(request.downstreamNonce === null ? {} : { downstreamNonce: request.downstreamNonce }), now, expiresAt })
    if (await this.input.persistence.createTransaction(prepared.database) !== 'TRANSACTION_CREATED') throw new Error('DARK_ORCHESTRATION_REJECTED')
    return Object.freeze({ provider: request.provider, brokerHandle: prepared.correlation.brokerHandle, browserBindingSecret: prepared.correlation.browserBindingSecret })
  }

  async continueFromHandle(input: Readonly<{ brokerHandle: string; browserBindingSecret: string }>): Promise<Readonly<{ provider: SocialProvider; authorization: PreparedDurableUpstreamLoginLeg['authorization'] }>> {
    const continuationDigest = downstreamAuthorizationBoundHandleDigest(input.brokerHandle, input.browserBindingSecret)
    const resolved = await this.input.persistence.resolveDurableContinuation(continuationDigest)
    if (resolved.outcome === 'CONTINUATION_BOUND' || resolved.outcome === 'CONTINUATION_RESUMED') return this.canonicalAuthorization(resolved)
    if (resolved.outcome !== 'CONTINUATION_PENDING' || !resolved.attemptId || !resolved.clientId || !resolved.provider) throw new Error('DARK_CONTINUATION_REJECTED')
    const client = this.input.clients.find(value => value.clientId === resolved.clientId)
    if (!client || client.provider !== resolved.provider) throw new Error('DARK_CONTINUATION_REJECTED')
    const upstream = this.input.upstream[client.provider]
    const prepared = prepareDurableUpstreamLoginLeg({ attemptId: resolved.attemptId, provider: client.provider, clientId: upstream.clientId, redirectUri: upstream.redirectUri, ...(client.provider === 'naver' ? {} : { pkceKey: this.input.keys.upstreamPkce }) })
    const continuation = encryptUpstreamContinuation({ plaintext: { rawState: prepared.authorization.rawState, rawNonce: prepared.authorization.rawNonce }, key: this.input.keys.upstreamContinuation, attemptId: resolved.attemptId, legId: prepared.database.legId, provider: client.provider, clientBindingDigest: prepared.database.clientBindingDigest })
    const bound = await this.input.persistence.createOrResumeDurableContinuation({ continuationDigest, leg: prepared.database, continuation })
    if (bound.outcome !== 'CONTINUATION_BOUND' && bound.outcome !== 'CONTINUATION_RESUMED') throw new Error('DARK_CONTINUATION_REJECTED')
    // A concurrent winner's context is authoritative. Never use locally generated raw values after the RPC returns.
    return this.canonicalAuthorization(bound)
  }

  private canonicalAuthorization(result: DurableContinuationResult): Readonly<{ provider: SocialProvider; authorization: PreparedDurableUpstreamLoginLeg['authorization'] }> {
    if (!result.attemptId || !result.clientId || !result.provider || !result.legId || !result.clientBindingDigest || !result.stateDigest || !result.continuationCiphertext || !result.continuationIv || !result.continuationKeyVersion) throw new Error('DARK_CONTINUATION_REJECTED')
    const client = this.input.clients.find(value => value.clientId === result.clientId)
    if (!client || client.provider !== result.provider) throw new Error('DARK_CONTINUATION_REJECTED')
    const restored = decryptUpstreamContinuation({ encrypted: { ciphertext: result.continuationCiphertext, iv: result.continuationIv, keyVersion: result.continuationKeyVersion }, key: this.input.keys.upstreamContinuation, attemptId: result.attemptId, legId: result.legId, provider: result.provider, clientBindingDigest: result.clientBindingDigest })
    if (!Buffer.from(upstreamStateDigest(restored.rawState)).equals(Buffer.from(result.stateDigest)) || (restored.rawNonce === null ? result.nonceDigest !== null : result.nonceDigest === null || !Buffer.from(upstreamNonceDigest(restored.rawNonce)).equals(Buffer.from(result.nonceDigest)))) throw new Error('DARK_CONTINUATION_REJECTED')
    if (result.provider === 'naver') {
      if (restored.rawNonce !== null || result.pkceS256Challenge !== null || result.pkceVerifierCiphertext !== null || result.pkceVerifierIv !== null || result.pkceVerifierKeyVersion !== null) throw new Error('DARK_CONTINUATION_REJECTED')
    } else if (restored.rawNonce === null || !result.pkceS256Challenge || !result.pkceVerifierCiphertext || !result.pkceVerifierIv || !result.pkceVerifierKeyVersion) throw new Error('DARK_CONTINUATION_REJECTED')
    return Object.freeze({ provider: result.provider, authorization: Object.freeze({ rawState: restored.rawState, rawNonce: restored.rawNonce, pkceChallenge: result.pkceS256Challenge }) })
  }

  async callback(input: Readonly<{ provider: SocialProvider; callbackUrl: string; verifier: DurableProviderVerifier }>): Promise<'EXISTING_PRIMARY' | 'RECOVERY_REQUIRED' | 'IDENTITY_DECISION_IN_PROGRESS' | 'IDENTITY_REJECTED'> {
    const correlated = await correlateUpstreamCallback({ provider: input.provider, callbackUrl: input.callbackUrl, registry: this.input.upstream as UpstreamCallbackRegistry, claimByState: this.input.persistence.claimCallback })
    if (!correlated.context || correlated.context.provider !== input.provider) throw new Error('DARK_CALLBACK_REJECTED')
    let verifiedUpstream: Readonly<{ provider: SocialProvider; upstreamSubject: Uint8Array; authenticationTime: number }>
    try { verifiedUpstream = await input.verifier.verify(correlated.context) }
    catch (error) {
      // A claimed callback must never be abandoned: transition through the approved M failure RPC.
      const code = error instanceof SocialBrokerError ? error.code : undefined
      await this.input.persistence.failClaimedUpstreamLeg({ attemptId: correlated.context.attemptId, legId: correlated.context.legId, reason: code === 'UPSTREAM_RESPONSE_EXPIRED' ? 'expired' : 'provider_failure' })
      throw new Error('DARK_CALLBACK_REJECTED')
    }
    if (verifiedUpstream.provider !== input.provider || !Number.isSafeInteger(verifiedUpstream.authenticationTime) || verifiedUpstream.authenticationTime < 0) throw new Error('DARK_CALLBACK_REJECTED')
    const brokerSubject = deriveBrokerSubject({ provider: input.provider, upstreamSubject: verifiedUpstream.upstreamSubject, keyVersion: `k${String(this.input.keys.brokerSubjectKeyVersion).padStart(2, '0')}`, key: this.input.keys.brokerSubject })
    const digest = Buffer.from(brokerSubject.split(':').at(-1)!, 'base64url')
    return this.input.persistence.recordVerifiedIdentity({ attemptId: correlated.context.attemptId, legId: correlated.context.legId, provider: input.provider, brokerSubject, subjectDigest: digest, subjectKeyVersion: this.input.keys.brokerSubjectKeyVersion })
  }

  async finalizeReadyAttempt(input: Readonly<{ trustedAttemptId: string; authenticationTime: number }>): Promise<Readonly<{ redirectUri: string; authorizationCode: string; downstreamState: string | null }>> {
    const context = await this.input.persistence.resolveIssuanceContext(input.trustedAttemptId)
    if (!context) throw new Error('DARK_FINALIZATION_REJECTED')
    const prepared = prepareTransactionBoundBrokerCode({ context, authenticationTime: input.authenticationTime, ...(context.downstreamNonce === null ? {} : { downstreamNonceKey: this.input.keys.downstreamNonce }) })
    if (await this.input.persistence.issueTransactionBoundCode(prepared.database) !== 'AUTHORIZATION_CODE_CREATED') throw new Error('DARK_FINALIZATION_REJECTED')
    return Object.freeze({ redirectUri: context.redirectUri, authorizationCode: prepared.response.authorizationCode, downstreamState: prepared.response.downstreamState })
  }
}
