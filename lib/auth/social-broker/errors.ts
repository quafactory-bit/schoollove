export const SOCIAL_BROKER_ERROR_CODES = [
  'INVALID_PROVIDER',
  'INVALID_SUBJECT',
  'INVALID_KEY_VERSION',
  'INVALID_KEY',
  'INVALID_ATTEMPT_ID',
  'ATTEMPT_ID_REUSED',
  'ATTEMPT_EXPIRED',
  'INVALID_ATTEMPT_TRANSITION',
  'TERMINAL_ATTEMPT_REUSE',
  'STATE_REJECTED',
  'PKCE_REJECTED',
  'PKCE_DOWNGRADE_REJECTED',
  'NONCE_REJECTED',
  'PROVIDER_MISMATCH',
  'REPLAY_REJECTED',
  'UPSTREAM_RESPONSE_EXPIRED',
  'UPSTREAM_RESPONSE_MALFORMED',
  'UPSTREAM_TRANSPORT_REJECTED',
  'UPSTREAM_ERROR',
  'UNKNOWN_CLIENT',
  'REDIRECT_URI_REJECTED',
  'AUTHORIZATION_CODE_REJECTED',
  'AUTHORIZATION_CODE_EXPIRED',
] as const

export type SocialBrokerErrorCode = (typeof SOCIAL_BROKER_ERROR_CODES)[number]

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
  'verifier_unclassified_failure',
] as const

export type GoogleCallbackDiagnosticReason = (typeof GOOGLE_CALLBACK_DIAGNOSTIC_REASONS)[number]

const socialBrokerErrorCodes = new Set<string>(SOCIAL_BROKER_ERROR_CODES)
const googleCallbackDiagnosticReasons = new Set<string>(GOOGLE_CALLBACK_DIAGNOSTIC_REASONS)

export type ExtractedGoogleCallbackDiagnostic = Readonly<{
  reason: GoogleCallbackDiagnosticReason
  upstreamStatus?: number
}>

/**
 * Reads only allowlisted scalar metadata from an unknown error boundary.
 * It never serializes, spreads, or returns the source error object.
 */
export function extractGoogleCallbackDiagnostic(error: unknown): ExtractedGoogleCallbackDiagnostic | null {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) return null
  try {
    const reason = Reflect.get(error, 'diagnosticReason')
    if (typeof reason !== 'string' || !googleCallbackDiagnosticReasons.has(reason)) return null
    const upstreamStatus = Reflect.get(error, 'upstreamStatus')
    const validStatus = Number.isInteger(upstreamStatus) && (upstreamStatus as number) >= 100 && (upstreamStatus as number) <= 599
      ? upstreamStatus as number
      : undefined
    return Object.freeze({ reason: reason as GoogleCallbackDiagnosticReason, ...(validStatus === undefined ? {} : { upstreamStatus: validStatus }) })
  } catch {
    return null
  }
}

/** Reads one allowlisted lifecycle code without relying on cross-module class identity. */
export function extractSocialBrokerErrorCode(error: unknown): SocialBrokerErrorCode | undefined {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) return undefined
  try {
    const code = Reflect.get(error, 'code')
    return typeof code === 'string' && socialBrokerErrorCodes.has(code) ? code as SocialBrokerErrorCode : undefined
  } catch {
    return undefined
  }
}

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
