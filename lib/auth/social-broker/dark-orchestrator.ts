import 'server-only'
import { randomBytes } from 'node:crypto'
import { prepareBrowserBoundDownstreamAuthorizationTransaction, downstreamAuthorizationBoundHandleDigest, type PreparedDownstreamAuthorizationTransaction } from './authorization-transaction'
import { correlateUpstreamCallback, type ClaimByState, type UpstreamCallbackRegistry } from './callback-correlation'
import { prepareDurableUpstreamLoginLeg, type PreparedDurableUpstreamLoginLeg, type UpstreamPkceVerifierKey } from './durable-upstream-leg'
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
  claimTransaction(handleDigest: Uint8Array): Promise<Readonly<{ outcome: 'TRANSACTION_CLAIMED' | 'CORRELATION_REJECTED' | 'EXPIRED'; transactionId: string | null; attemptId: string | null; clientId: string | null; redirectUri: string | null; scopes: string | null; pkceS256Challenge: string | null }> >
  createUpstreamLeg(input: PreparedDurableUpstreamLoginLeg['database'] & Readonly<{ attemptId: string }>): Promise<'UPSTREAM_LEG_CREATED'>
  bindTransactionLeg(input: Readonly<{ transactionId: string; legId: string }>): Promise<'UPSTREAM_BOUND'>
  claimCallback: ClaimByState
  failClaimedUpstreamLeg(input: Readonly<{ attemptId: string; legId: string; reason: 'provider_failure' | 'identity_failure' | 'expired' }>): Promise<'REJECTED' | 'EXPIRED' | 'REPLAY_REJECTED'>
  recordVerifiedIdentity(input: Readonly<{ attemptId: string; legId: string; provider: SocialProvider; brokerSubject: string; subjectDigest: Uint8Array; subjectKeyVersion: number }>): Promise<'EXISTING_PRIMARY' | 'RECOVERY_REQUIRED' | 'IDENTITY_DECISION_IN_PROGRESS' | 'IDENTITY_REJECTED'>
  resolveIssuanceContext(attemptId: string): Promise<TrustedAuthorizationTransactionIssuanceContext | null>
  issueTransactionBoundCode(input: ReturnType<typeof prepareTransactionBoundBrokerCode>['database']): Promise<'AUTHORIZATION_CODE_CREATED' | 'AUTHORIZATION_CODE_REJECTED'>
}>

export type TrustedUpstreamClient = Readonly<{ clientId: string; redirectUri: string }>
export type DarkUpstreamConfiguration = Readonly<Record<SocialProvider, TrustedUpstreamClient>>
export type DarkOrchestratorKeys = Readonly<{ upstreamPkce: UpstreamPkceVerifierKey; downstreamNonce: BrokerAuthorizationCodeNonceKey; brokerSubject: Uint8Array; brokerSubjectKeyVersion: number }>
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
    const claimed = await this.input.persistence.claimTransaction(downstreamAuthorizationBoundHandleDigest(input.brokerHandle, input.browserBindingSecret))
    if (claimed.outcome !== 'TRANSACTION_CLAIMED' || !claimed.transactionId || !claimed.attemptId || !claimed.clientId) throw new Error('DARK_CONTINUATION_REJECTED')
    const client = this.input.clients.find(value => value.clientId === claimed.clientId)
    if (!client) throw new Error('DARK_CONTINUATION_REJECTED')
    const upstream = this.input.upstream[client.provider]
    const prepared = prepareDurableUpstreamLoginLeg({ attemptId: claimed.attemptId, provider: client.provider, clientId: upstream.clientId, redirectUri: upstream.redirectUri, ...(client.provider === 'naver' ? {} : { pkceKey: this.input.keys.upstreamPkce }) })
    if (await this.input.persistence.createUpstreamLeg({ ...prepared.database, attemptId: claimed.attemptId }) !== 'UPSTREAM_LEG_CREATED' || await this.input.persistence.bindTransactionLeg({ transactionId: claimed.transactionId, legId: prepared.database.legId }) !== 'UPSTREAM_BOUND') throw new Error('DARK_CONTINUATION_REJECTED')
    return Object.freeze({ provider: client.provider, authorization: prepared.authorization })
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
