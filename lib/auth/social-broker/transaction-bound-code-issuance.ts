import 'server-only'
import {
  prepareBrokerAuthorizationCode,
  type BrokerAuthorizationCodeNonceKey,
  type PreparedBrokerAuthorizationCode,
} from './durable-code'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PKCE_S256_PATTERN = /^[A-Za-z0-9_-]{43}$/

/**
 * This is DB-resolved, service-only context. Browser/OIDC request parameters are
 * deliberately not accepted here: the durable authorization transaction owns them.
 */
export type TrustedAuthorizationTransactionIssuanceContext = Readonly<{
  authorizationTransactionId: string
  loginAttemptId: string
  clientId: string
  redirectUri: string
  pkceS256Challenge: string
  downstreamNonce: string | null
  downstreamState: string | null
}>

export type PreparedTransactionBoundBrokerCode = Readonly<{
  database: Readonly<{
    authorizationTransactionId: string
    loginAttemptId: string
    code: PreparedBrokerAuthorizationCode['database']
    /** Transient SQL proof; the RPC compares it to the transaction then never persists it. */
    downstreamNonceProof: string | null
  }>
  response: Readonly<{
    authorizationCode: string
    /** Relying-party round-trip data only, never an issuance authority. */
    downstreamState: string | null
  }>
}>

export function prepareTransactionBoundBrokerCode(input: Readonly<{
  /** Returned only by the service-only attempt-ID context resolver. */
  context: TrustedAuthorizationTransactionIssuanceContext
  /** Trusted server/provider verification time; never a downstream-request value. */
  authenticationTime: number
  downstreamNonceKey?: BrokerAuthorizationCodeNonceKey
}>): PreparedTransactionBoundBrokerCode {
  const { context } = input
  if (!UUID_PATTERN.test(context.authorizationTransactionId) || !UUID_PATTERN.test(context.loginAttemptId)
    || !context.clientId || !context.redirectUri || !PKCE_S256_PATTERN.test(context.pkceS256Challenge)
    || !Number.isSafeInteger(input.authenticationTime) || input.authenticationTime < 0
    || (context.downstreamNonce === null) !== (input.downstreamNonceKey === undefined)) {
    throw new Error('TRANSACTION_BOUND_BROKER_CODE_PREPARATION_REJECTED')
  }
  const prepared = prepareBrokerAuthorizationCode({
    clientId: context.clientId,
    redirectUri: context.redirectUri,
    pkceS256Challenge: context.pkceS256Challenge,
    authenticationTime: input.authenticationTime,
    ...(context.downstreamNonce === null
      ? {}
      : { downstreamNonce: context.downstreamNonce, downstreamNonceKey: input.downstreamNonceKey! }),
  })
  return Object.freeze({
    database: Object.freeze({
      authorizationTransactionId: context.authorizationTransactionId,
      loginAttemptId: context.loginAttemptId,
      code: prepared.database,
      downstreamNonceProof: context.downstreamNonce,
    }),
    response: Object.freeze({ authorizationCode: prepared.response.authorizationCode, downstreamState: context.downstreamState }),
  })
}
