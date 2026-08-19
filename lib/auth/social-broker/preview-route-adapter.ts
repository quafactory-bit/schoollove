import 'server-only'
import { openBrowserContinuity, sealBrowserContinuity, socialContinuityCookie, type BrowserSessionKey } from './browser-continuity-session'
import { DarkBrokerOrchestrator, type DurableProviderVerifier } from './dark-orchestrator'
import { DarkOidcHttpIssuer } from './http'
import { buildProviderAuthorizationRequest } from './provider-authorization-request'
import type { SocialProvider } from './types'
import { PREVIEW_SUPABASE_CALLBACK } from './preview-config'
import { recoveryContinuityCookie, sealRecoveryContinuity } from './recovery-continuity-session'

const clearCookie = Object.freeze({ ...socialContinuityCookie.options, maxAge: 0 })
const rejected = () => new Response(null, { status: 400, headers: { 'cache-control': 'no-store' } })
const cookie = (name: string, value: string, options: Readonly<{ httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number }>) => {
  const lifetime = `Max-Age=${options.maxAge}`
  return `${name}=${value}; ${lifetime}; Path=${options.path}; HttpOnly; Secure; SameSite=Lax`
}

export type PreviewRouteRuntime = Readonly<{
  orchestrator: DarkBrokerOrchestrator
  verifier: DurableProviderVerifier
  browserSessionKey: BrowserSessionKey
  now: () => number
  oidc: DarkOidcHttpIssuer
}>

/**
 * HTTP composition only. Deployed routes must inject this only after the separate
 * Preview-origin and downstream-client approvals; callers never supply provider or
 * durable IDs. This module has no environment lookup and does not activate routes.
 */
export function createPreviewRouteAdapter(runtime: PreviewRouteRuntime) {
  return Object.freeze({
    async authorize(request: Request): Promise<Response> {
      try {
        const begun = await runtime.orchestrator.begin(new URL(request.url))
        const continued = await runtime.orchestrator.continueFromHandle({ brokerHandle: begun.brokerHandle, browserBindingSecret: begun.browserBindingSecret })
        if (continued.provider !== begun.provider) return rejected()
        const upstream = buildProviderAuthorizationRequest({ provider: continued.provider, clientId: runtime.orchestrator.input.upstream[continued.provider].clientId, redirectUri: runtime.orchestrator.input.upstream[continued.provider].redirectUri, state: continued.authorization.rawState, nonce: continued.authorization.rawNonce, pkceChallenge: continued.authorization.pkceChallenge })
        return new Response(null, { status: 302, headers: {
          location: upstream.toString(),
          'cache-control': 'no-store',
          'set-cookie': cookie(socialContinuityCookie.name, sealBrowserContinuity({ provider: begun.provider, brokerHandle: begun.brokerHandle, browserBindingSecret: begun.browserBindingSecret, issuedAt: runtime.now(), expiresAt: runtime.now() + 600 }, runtime.browserSessionKey), socialContinuityCookie.options),
        } })
      } catch { return rejected() }
    },
    async callback(provider: SocialProvider, request: Request): Promise<Response> {
      const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${socialContinuityCookie.name}=`))?.slice(socialContinuityCookie.name.length + 1)
      try {
        const session = openBrowserContinuity(value, runtime.browserSessionKey, runtime.now())
        if (session.provider !== provider) return rejected()
        // The cookie is not merely a presence proof: bind this callback's exact
        // state to the same durable browser-bound continuation before state claim.
        const continuation = await runtime.orchestrator.continueFromHandle({ brokerHandle: session.brokerHandle, browserBindingSecret: session.browserBindingSecret })
        const states = new URL(request.url).searchParams.getAll('state')
        if (continuation.provider !== provider || states.length !== 1 || states[0] !== continuation.authorization.rawState) return rejected()
        const trusted = await runtime.orchestrator.callback({ provider, callbackUrl: request.url, verifier: runtime.verifier })
        if (trusted.outcome === 'RECOVERY_REQUIRED') {
          const response = new Response(null, { status: 302, headers: { location: '/auth/social/recovery', 'cache-control': 'no-store' } })
          response.headers.append('set-cookie', cookie(socialContinuityCookie.name, '', clearCookie))
          response.headers.append('set-cookie', cookie(recoveryContinuityCookie.name, sealRecoveryContinuity({
            stage: 'recovery_required', provider, trustedAttemptId: trusted.trustedAttemptId,
            brokerSubject: trusted.brokerSubject, authenticationTime: trusted.authenticationTime,
            verificationId: null, issuedAt: runtime.now(), expiresAt: runtime.now() + 600,
          }, runtime.browserSessionKey), recoveryContinuityCookie.options))
          return response
        }
        if (trusted.outcome !== 'EXISTING_PRIMARY') throw new Error('DARK_CALLBACK_REJECTED')
        const finalized = await runtime.orchestrator.finalizeReadyAttempt({ trustedAttemptId: trusted.trustedAttemptId, authenticationTime: trusted.authenticationTime })
        if (finalized.redirectUri !== PREVIEW_SUPABASE_CALLBACK) throw new Error('DARK_FINALIZATION_REJECTED')
        const destination = new URL(PREVIEW_SUPABASE_CALLBACK)
        destination.searchParams.set('code', finalized.authorizationCode)
        if (finalized.downstreamState !== null) destination.searchParams.set('state', finalized.downstreamState)
        const response = new Response(null, { status: 302, headers: { location: destination.toString(), 'cache-control': 'no-store' } })
        response.headers.append('set-cookie', cookie(socialContinuityCookie.name, '', clearCookie))
        response.headers.append('set-cookie', cookie(recoveryContinuityCookie.name, sealRecoveryContinuity({
          stage: 'downstream_finalized', provider, trustedAttemptId: trusted.trustedAttemptId,
          brokerSubject: trusted.brokerSubject, authenticationTime: trusted.authenticationTime,
          verificationId: null, issuedAt: runtime.now(), expiresAt: runtime.now() + 600,
        }, runtime.browserSessionKey), recoveryContinuityCookie.options))
        return response
      } catch {
        const response = rejected(); response.headers.append('set-cookie', cookie(socialContinuityCookie.name, '', clearCookie)); response.headers.append('set-cookie', cookie(recoveryContinuityCookie.name, '', { ...recoveryContinuityCookie.options, maxAge: 0 })); return response
      }
    },
    discovery: () => Response.json(runtime.oidc.discovery(), { headers: { 'cache-control': 'no-store' } }),
    jwks: () => Response.json(runtime.oidc.jwks(), { headers: { 'cache-control': 'no-store' } }),
    authorizeOidc: (request: Request) => runtime.oidc.authorizeRequest(request),
    tokenOidc: (request: Request) => runtime.oidc.tokenRequest(request),
  })
}
