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
  | 'UPSTREAM_ERROR'
  | 'UNKNOWN_CLIENT'
  | 'REDIRECT_URI_REJECTED'
  | 'AUTHORIZATION_CODE_REJECTED'
  | 'AUTHORIZATION_CODE_EXPIRED'

export class SocialBrokerError extends Error {
  readonly code: SocialBrokerErrorCode

  constructor(code: SocialBrokerErrorCode) {
    super(code)
    this.name = 'SocialBrokerError'
    this.code = code
  }
}
export function brokerFailure(code: SocialBrokerErrorCode): never {
  throw new SocialBrokerError(code)
}
