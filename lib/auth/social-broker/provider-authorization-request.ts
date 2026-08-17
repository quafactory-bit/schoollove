import 'server-only'
import type { SocialProvider } from './types'
import { GOOGLE_OIDC_METADATA, KAKAO_OIDC_METADATA, NAVER_OAUTH_METADATA } from './upstream-adapters'

export type ProviderAuthorizationInput = Readonly<{
  provider: SocialProvider
  clientId: string
  redirectUri: string
  state: string
  nonce: string | null
  pkceChallenge: string | null
}>

function rejected(): never { throw new Error('UPSTREAM_AUTHORIZATION_REQUEST_REJECTED') }
function opaque(value: string | null): string {
  if (!value || Buffer.byteLength(value, 'utf8') > 2048 || /[\u0000-\u001f\u007f]/.test(value)) rejected()
  return value
}
function httpsCallback(value: string): string {
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) rejected(); return url.toString() } catch { rejected() }
}

/** Builds only frozen, provider-pinned authorization requests from durable canonical context. */
export function buildProviderAuthorizationRequest(input: ProviderAuthorizationInput): URL {
  const callback = httpsCallback(input.redirectUri)
  const state = opaque(input.state)
  const clientId = opaque(input.clientId)
  const url = new URL(input.provider === 'google' ? GOOGLE_OIDC_METADATA.authorizationEndpoint : input.provider === 'kakao' ? KAKAO_OIDC_METADATA.authorizationEndpoint : NAVER_OAUTH_METADATA.authorizationEndpoint)
  const parameters = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: callback, state })
  if (input.provider === 'naver') return urlWith(url, parameters)
  const nonce = opaque(input.nonce); const challenge = opaque(input.pkceChallenge)
  parameters.set('scope', input.provider === 'google' ? 'openid profile' : 'openid')
  parameters.set('nonce', nonce); parameters.set('code_challenge', challenge); parameters.set('code_challenge_method', 'S256')
  return urlWith(url, parameters)
}
function urlWith(url: URL, parameters: URLSearchParams): URL { url.search = parameters.toString(); return url }
