import 'server-only'
import { createDurableProviderVerifier } from './durable-provider-verifier'
import { DarkBrokerOrchestrator } from './dark-orchestrator'
import { DarkOidcHttpIssuer } from './http'
import { PREVIEW_BROKER_ISSUER, type BrokerPreviewConfig, loadBrokerPreviewConfig } from './preview-config'
import { createPreviewBrokerPersistence, createPreviewCodeConsumer, type PreviewRpcClient } from './preview-persistence'
import { createPreviewRouteAdapter } from './preview-route-adapter'
import { createServerUpstreamTransport } from './server-transport'

export type ActivePreviewRouteAdapter = ReturnType<typeof createPreviewRouteAdapter>
export type ActivePreviewServices = Readonly<{
  adapter: ActivePreviewRouteAdapter
  orchestrator: DarkBrokerOrchestrator
  config: BrokerPreviewConfig
  client: PreviewRpcClient
  now: () => number
}>
const now = () => Math.floor(Date.now() / 1000)

/**
 * Builds the only deployed social runtime. All authority is configuration-owned:
 * request Host/forwarded headers and callback query fields never select origin,
 * provider credentials, durable IDs, or downstream clients.
 */
export function createActivePreviewServices(config: BrokerPreviewConfig, client: PreviewRpcClient, clock: () => number = now): ActivePreviewServices {
  const persistence = createPreviewBrokerPersistence(client)
  // The deployed registry contains only Google; the cast preserves the historical
  // generic broker type while unsupported providers have no reachable runtime path.
  const upstream = Object.freeze({ google: Object.freeze({ clientId: config.providers.google.clientId, redirectUri: `${PREVIEW_BROKER_ISSUER}/auth/social/callback/google` }) }) as Readonly<Record<'google' | 'kakao' | 'naver', Readonly<{ clientId: string; redirectUri: string }>>>
  const orchestrator = new DarkBrokerOrchestrator({
    clients: config.downstreamClients,
    persistence,
    upstream,
    keys: Object.freeze({ upstreamPkce: config.upstreamPkceKey, upstreamContinuation: config.upstreamContinuationKey, downstreamNonce: config.downstreamNonceKey, brokerSubject: config.brokerSubjectKey.material, brokerSubjectKeyVersion: 1 }),
    now: clock,
  })
  const transport = createServerUpstreamTransport(config.providers)
  const verifier = createDurableProviderVerifier({ upstream, pkceKey: config.upstreamPkceKey, transport, now: clock })
  const oidc = new DarkOidcHttpIssuer({
    issuer: PREVIEW_BROKER_ISSUER,
    signingKey: config.oidcSigningKey,
    registry: Object.freeze({
      clients: config.downstreamClients,
      nonceKey: config.downstreamNonceKey,
      consumeCode: createPreviewCodeConsumer(client),
      // /oauth/authorize is owned by the browser-bound adapter below. This
      // defensive callback is unreachable unless a future route bypasses it.
      authorize: async () => { throw new Error('PREVIEW_AUTHORIZATION_ROUTE_REQUIRED') },
    }),
  })
  const adapter = createPreviewRouteAdapter({ orchestrator, verifier, browserSessionKey: config.browserSessionKey, now: clock, oidc })
  return Object.freeze({ adapter, orchestrator, config, client, now: clock })
}

export function createActivePreviewRuntime(config: BrokerPreviewConfig, client: PreviewRpcClient, clock: () => number = now): ActivePreviewRouteAdapter {
  return createActivePreviewServices(config, client, clock).adapter
}

/**
 * Returns an adapter only for the exact owned Preview origin and complete
 * Preview configuration. Every malformed/off/Production request is 404-bound.
 */
export async function activePreviewRouteAdapter(request: Request): Promise<ActivePreviewRouteAdapter | null> {
  try {
    if (new URL(request.url).origin !== PREVIEW_BROKER_ISSUER) return null
    const config = loadBrokerPreviewConfig()
    if (config.exposure !== 'preview') return null
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    return createActivePreviewRuntime(config, getSupabaseAdmin())
  } catch { return null }
}
