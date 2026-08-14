import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const HANDLE_DOMAIN = 'schoollove:downstream-authorization-transaction-handle:v1\0'
const BROWSER_BOUND_HANDLE_DOMAIN = 'schoollove:downstream-authorization-browser-bound-handle:v1'
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PreparedDownstreamAuthorizationTransaction = Readonly<{
  database: Readonly<{
    transactionId: string
    loginAttemptId: string
    brokerHandleDigest: Uint8Array
    clientId: string
    redirectUri: string
    responseType: 'code'
    requestedScopes: string
    pkceS256Challenge: string
    pkceMethod: 'S256'
    downstreamNonce: string | null
    downstreamState: string | null
    expiresAt: number
  }>
  /** Browser-continuity material only; never persist, log, or use as a database ID. */
  correlation: Readonly<{ brokerHandle: string }>
}>

/** Q-only browser-bound continuation; raw material stays in the browser session, never in the database. */
export type PreparedBrowserBoundDownstreamAuthorizationTransaction = Readonly<{
  database: PreparedDownstreamAuthorizationTransaction['database']
  correlation: Readonly<{ brokerHandle: string; browserBindingSecret: string }>
}>

export function downstreamAuthorizationTransactionHandleDigest(rawHandle: string): Uint8Array {
  if (typeof rawHandle !== 'string' || !HANDLE_PATTERN.test(rawHandle)) throw new Error('DOWNSTREAM_AUTHORIZATION_HANDLE_INVALID')
  return createHash('sha256').update(HANDLE_DOMAIN, 'utf8').update(rawHandle, 'ascii').digest()
}

function framed(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8'); const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(bytes.byteLength)
  return Buffer.concat([length, bytes])
}

/** Binds the bearer handle to a separate ephemeral browser-session secret without changing the legacy O digest. */
export function downstreamAuthorizationBoundHandleDigest(rawHandle: string, browserBindingSecret: string): Uint8Array {
  if (typeof rawHandle !== 'string' || !HANDLE_PATTERN.test(rawHandle) || typeof browserBindingSecret !== 'string' || !HANDLE_PATTERN.test(browserBindingSecret)) throw new Error('DOWNSTREAM_AUTHORIZATION_BROWSER_BINDING_INVALID')
  return createHash('sha256').update(Buffer.concat([framed(BROWSER_BOUND_HANDLE_DOMAIN), framed(rawHandle), framed(browserBindingSecret)])).digest()
}

function normalizedScopes(scopes: readonly string[]): string {
  if (!Array.isArray(scopes) || scopes.length === 0) throw new Error('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
  const unique = [...new Set(scopes)]
  if (unique.some(scope => !/^[A-Za-z0-9:_-]{1,128}$/.test(scope))) throw new Error('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
  return unique.sort().join(' ')
}

/** Freezes a validated downstream authorization request before any upstream browser leg starts. */
export function prepareDownstreamAuthorizationTransaction(input: Readonly<{
  loginAttemptId: string
  clientId: string
  redirectUri: string
  scopes: readonly string[]
  pkceS256Challenge: string
  downstreamNonce?: string
  downstreamState?: string
  now: number
  expiresAt: number
  transactionId?: string
  brokerHandle?: string
}>): PreparedDownstreamAuthorizationTransaction {
  const transactionId = input.transactionId ?? randomUUID()
  const brokerHandle = input.brokerHandle ?? randomBytes(32).toString('base64url')
  if (!UUID_PATTERN.test(transactionId) || !UUID_PATTERN.test(input.loginAttemptId) || !input.clientId || !input.redirectUri
    || !PKCE_PATTERN.test(input.pkceS256Challenge) || !Number.isSafeInteger(input.now) || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.now
    || (input.downstreamNonce !== undefined && (input.downstreamNonce.length === 0 || input.downstreamNonce.length > 2048))
    || (input.downstreamState !== undefined && (input.downstreamState.length === 0 || input.downstreamState.length > 2048))) {
    throw new Error('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
  }
  let redirect: URL
  try { redirect = new URL(input.redirectUri) } catch { throw new Error('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID') }
  if (redirect.username || redirect.password || redirect.hash || !['https:', 'http:'].includes(redirect.protocol)) throw new Error('DOWNSTREAM_AUTHORIZATION_TRANSACTION_INVALID')
  return Object.freeze({
    database: Object.freeze({
      transactionId, loginAttemptId: input.loginAttemptId, brokerHandleDigest: downstreamAuthorizationTransactionHandleDigest(brokerHandle),
      // The HTTP issuer already exact-matches the registered redirect. Preserve that
      // validated string verbatim for all later authorization-code bindings.
      clientId: input.clientId, redirectUri: input.redirectUri, responseType: 'code', requestedScopes: normalizedScopes(input.scopes),
      pkceS256Challenge: input.pkceS256Challenge, pkceMethod: 'S256', downstreamNonce: input.downstreamNonce ?? null,
      downstreamState: input.downstreamState ?? null, expiresAt: input.expiresAt,
    }),
    correlation: Object.freeze({ brokerHandle }),
  })
}

/**
 * Q application boundary: a continuation requires both the opaque handle and
 * a separately-held browser binding. The database stores only their bound digest.
 */
export function prepareBrowserBoundDownstreamAuthorizationTransaction(input: Readonly<{
  loginAttemptId: string
  clientId: string
  redirectUri: string
  scopes: readonly string[]
  pkceS256Challenge: string
  downstreamNonce?: string
  downstreamState?: string
  now: number
  expiresAt: number
  transactionId?: string
  brokerHandle?: string
  browserBindingSecret?: string
}>): PreparedBrowserBoundDownstreamAuthorizationTransaction {
  const prepared = prepareDownstreamAuthorizationTransaction(input)
  const browserBindingSecret = input.browserBindingSecret ?? randomBytes(32).toString('base64url')
  const boundHandleDigest = downstreamAuthorizationBoundHandleDigest(prepared.correlation.brokerHandle, browserBindingSecret)
  return Object.freeze({
    database: Object.freeze({ ...prepared.database, brokerHandleDigest: boundHandleDigest }),
    correlation: Object.freeze({ brokerHandle: prepared.correlation.brokerHandle, browserBindingSecret }),
  })
}
