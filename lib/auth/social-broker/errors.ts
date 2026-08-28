export type SocialBrokerErrorCode =
  | 'INVALID_PROVIDER'
  | 'INVALID_SUBJECT'
  | 'INVALID_KEY_VERSION'
  | 'INVALID_KEY'
  | 'INVALID_ATTEMPT_ID'
  | 'ATTEMPT_ID_REUSED'
  | 'ATTEMPT_EXPIRED'
  | 'INVALID_ATTEMPT_TRANSITION'
  | 'TERMINAL_ATTEMPT_REUSE'
  | 'STATE_REJECTED'
  | 'PKCE_REJECTED'
  | 'PKCE_DOWNGRADE_REJECTED'
  | 'NONCE_REJECTED'
  | 'PROVIDER_MISMATCH'
  | 'REPLAY_REJECTED'
  | 'UPSTREAM_RESPONSE_EXPIRED'
  | 'UPSTREAM_RESPONSE_MALFORMED'
  | 'UPSTREAM_TRANSPORT_REJECTED'
  | 'UPSTREAM_ERROR'
  | 'UNKNOWN_CLIENT'
  | 'REDIRECT_URI_REJECTED'
  | 'AUTHORIZATION_CODE_REJECTED'
  | 'AUTHORIZATION_CODE_EXPIRED'

export const GOOGLE_CALLBACK_DIAGNOSTIC_REASONS = [
  'pkce_resume_failed',
  'token_exchange_transport_failed',
  'token_exchange_http_failed',
  'token_response_malformed',
  'id_token_missing_or_malformed',
  'jwks_fetch_failed',
  'jwks_key_rejected',
  'id_token_signature_failed',
  'issuer_or_audience_failed',
  'token_time_failed',
  'nonce_failed',
  'provider_identity_malformed',
] as const

export type GoogleCallbackDiagnosticReason = (typeof GOOGLE_CALLBACK_DIAGNOSTIC_REASONS)[number]

const diagnostics = new WeakMap<SocialBrokerError, Readonly<{ reason: GoogleCallbackDiagnosticReason; upstreamStatus?: number }>>()

export class SocialBrokerError extends Error {
  readonly code: SocialBrokerErrorCode

  get diagnosticReason(): GoogleCallbackDiagnosticReason | undefined { return diagnostics.get(this)?.reason }
  get upstreamStatus(): number | undefined { return diagnostics.get(this)?.upstreamStatus }

  constructor(code: SocialBrokerErrorCode, diagnostic?: Readonly<{ reason: GoogleCallbackDiagnosticReason; upstreamStatus?: number }>) {
    super(code)
    this.name = 'SocialBrokerError'
    this.code = code
    if (diagnostic) {
      const upstreamStatus = Number.isInteger(diagnostic.upstreamStatus) && diagnostic.upstreamStatus! >= 100 && diagnostic.upstreamStatus! <= 599
        ? diagnostic.upstreamStatus
        : undefined
      diagnostics.set(this, Object.freeze({ reason: diagnostic.reason, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) }))
    }
  }
}
export function brokerFailure(code: SocialBrokerErrorCode): never {
  throw new SocialBrokerError(code)
}

export function diagnosticFailure(
  code: SocialBrokerErrorCode,
  reason: GoogleCallbackDiagnosticReason,
  upstreamStatus?: number,
): never {
  throw new SocialBrokerError(code, { reason, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) })
}
