import 'server-only'
import type { UpstreamHttpResponse, UpstreamHttpTransport } from './upstream-adapters'
import { brokerFailure, diagnosticFailure, SocialBrokerError, type GoogleCallbackDiagnosticReason } from './errors'
import type { SocialProvider } from './types'

const TIMEOUT_MS = 5_000
const MAX_BODY_BYTES = 128 * 1024
const endpoints = Object.freeze({
  google: Object.freeze({ token: 'https://oauth2.googleapis.com/token', jwks: 'https://www.googleapis.com/oauth2/v3/certs' }),
  kakao: Object.freeze({ token: 'https://kauth.kakao.com/oauth/token', jwks: 'https://kauth.kakao.com/.well-known/jwks.json' }),
  naver: Object.freeze({ token: 'https://nid.naver.com/oauth2.0/token', profile: 'https://openapi.naver.com/v1/nid/me' }),
})
export type TransportCredentials = Readonly<Partial<Record<SocialProvider, Readonly<{ clientId: string; clientSecret: string }>>>>
type Fetcher = typeof fetch

function rejected(reason: GoogleCallbackDiagnosticReason): never { diagnosticFailure('UPSTREAM_TRANSPORT_REJECTED', reason) }
async function bounded(fetcher: Fetcher, url: string, init: RequestInit, transportReason: GoogleCallbackDiagnosticReason, malformedReason: GoogleCallbackDiagnosticReason): Promise<UpstreamHttpResponse> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', signal: controller.signal })
    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) diagnosticFailure('UPSTREAM_RESPONSE_MALFORMED', malformedReason)
    return Object.freeze({ status: response.status, contentType, body, url })
  } catch (error) {
    if (error instanceof SocialBrokerError && error.diagnosticReason) throw error
    rejected(transportReason)
  } finally { clearTimeout(timer) }
}
/** Production-shaped pinned transport. It has no retries and never logs request/response material. */
export function createServerUpstreamTransport(credentials: TransportCredentials, fetcher: Fetcher = fetch): UpstreamHttpTransport {
  return Object.freeze({
    async exchangeCode(input) {
      const credential = credentials[input.provider]
      const expected = endpoints[input.provider].token
      if (!credential || input.clientId !== credential.clientId || input.tokenEndpoint !== expected || !input.redirectUri || !input.authorizationCode) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
      const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: credential.clientId, client_secret: credential.clientSecret, code: input.authorizationCode, redirect_uri: input.redirectUri })
      if (input.provider === 'naver') { if (!input.state) brokerFailure('UPSTREAM_RESPONSE_MALFORMED'); body.set('state', input.state) }
      else { if (!input.codeVerifier) diagnosticFailure('UPSTREAM_RESPONSE_MALFORMED', 'pkce_resume_failed'); body.set('code_verifier', input.codeVerifier) }
      return bounded(fetcher, expected, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: body.toString() }, 'token_exchange_transport_failed', 'token_response_malformed')
    },
    async fetchJwks(input) {
      if (input.provider !== 'google' && input.provider !== 'kakao') rejected('jwks_fetch_failed')
      const expected = endpoints[input.provider].jwks
      if (input.jwksUri !== expected) rejected('jwks_fetch_failed')
      return bounded(fetcher, expected, { headers: { accept: 'application/json' } }, 'jwks_fetch_failed', 'jwks_key_rejected')
    },
    async fetchNaverProfile(input) {
      if (input.profileEndpoint !== endpoints.naver.profile || !input.accessToken) rejected('provider_identity_malformed')
      return bounded(fetcher, endpoints.naver.profile, { headers: { accept: 'application/json', authorization: `Bearer ${input.accessToken}` } }, 'provider_identity_malformed', 'provider_identity_malformed')
    },
  })
}
