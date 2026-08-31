import 'server-only'
import { createDurableProviderVerifier } from './durable-provider-verifier'
import { DarkBrokerOrchestrator } from './dark-orchestrator'
import { DarkOidcHttpIssuer } from './http'
import { type BrokerActiveConfig, loadBrokerConfig } from './preview-config'
import { createPreviewBrokerPersistence, createPreviewCodeConsumer, type PreviewRpcClient } from './preview-persistence'
import { createPreviewRouteAdapter } from './preview-route-adapter'
import { createServerUpstreamTransport } from './server-transport'

export type ActiveBrokerRouteAdapter = ReturnType<typeof createPreviewRouteAdapter>
export type ActiveBrokerServices = Readonly<{
  adapter: ActiveBrokerRouteAdapter
  orchestrator: DarkBrokerOrchestrator
  config: BrokerActiveConfig
  client: PreviewRpcClient
  now: () => number
}>
const now = () => Math.floor(Date.now() / 1000)

/**
 * Builds the only deployed social runtime. All authority is configuration-owned:
 * request Host/forwarded headers and callback query fields never select origin,
 * provider credentials, durable IDs, or downstream clients.
 */
export function createActiveBrokerServices(config: BrokerActiveConfig, client: PreviewRpcClient, clock: () => number = now): ActiveBrokerServices {
  const persistence = createPreviewBrokerPersistence(client)
  // The deployed registry contains only Google; the cast preserves the historical
  // generic broker type while unsupported providers have no reachable runtime path.
  const upstream = Object.freeze({ google: Object.freeze({ clientId: config.providers.google.clientId, redirectUri: `${config.issuer}/auth/social/callback/google` }) }) as Readonly<Record<'google' | 'kakao' | 'naver', Readonly<{ clientId: string; redirectUri: string }>>>
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
    issuer: config.issuer,
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
  const adapter = createPreviewRouteAdapter({ orchestrator, verifier, browserSessionKey: config.browserSessionKey, downstreamCallback: config.supabaseCallback, now: clock, oidc })
  return Object.freeze({ adapter, orchestrator, config, client, now: clock })
}

export function createActiveBrokerRuntime(config: BrokerActiveConfig, client: PreviewRpcClient, clock: () => number = now): ActiveBrokerRouteAdapter {
  return createActiveBrokerServices(config, client, clock).adapter
}

/**
 * Returns an adapter only for the exact canonical origin owned by the active
 * deployment profile. Every malformed, off, or cross-environment request is
 * 404-bound.
 */
export async function activeBrokerRouteAdapter(request: Request): Promise<ActiveBrokerRouteAdapter | null> {
  try {
    const config = loadBrokerConfig()
    if (config.exposure === 'off' || new URL(request.url).origin !== config.issuer) return null
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    return createActiveBrokerRuntime(config, getSupabaseAdmin())
  } catch { return null }
}
