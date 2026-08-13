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
  authenticationTime: number
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
  trusted: TrustedAuthorizationTransactionIssuanceContext
  downstreamNonceKey?: BrokerAuthorizationCodeNonceKey
}>): PreparedTransactionBoundBrokerCode {
  const { trusted } = input
  if (!UUID_PATTERN.test(trusted.authorizationTransactionId) || !UUID_PATTERN.test(trusted.loginAttemptId)
    || !trusted.clientId || !trusted.redirectUri || !PKCE_S256_PATTERN.test(trusted.pkceS256Challenge)
    || !Number.isSafeInteger(trusted.authenticationTime) || trusted.authenticationTime < 0
    || (trusted.downstreamNonce === null) !== (input.downstreamNonceKey === undefined)) {
    throw new Error('TRANSACTION_BOUND_BROKER_CODE_PREPARATION_REJECTED')
  }
  const prepared = prepareBrokerAuthorizationCode({
    clientId: trusted.clientId,
    redirectUri: trusted.redirectUri,
    pkceS256Challenge: trusted.pkceS256Challenge,
    authenticationTime: trusted.authenticationTime,
    ...(trusted.downstreamNonce === null
      ? {}
      : { downstreamNonce: trusted.downstreamNonce, downstreamNonceKey: input.downstreamNonceKey! }),
  })
  return Object.freeze({
    database: Object.freeze({
      authorizationTransactionId: trusted.authorizationTransactionId,
      loginAttemptId: trusted.loginAttemptId,
      code: prepared.database,
      downstreamNonceProof: trusted.downstreamNonce,
    }),
    response: Object.freeze({ authorizationCode: prepared.response.authorizationCode, downstreamState: trusted.downstreamState }),
  })
}
