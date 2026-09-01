import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'
import { loadUserLoginBrokerConfig } from '@/lib/auth/social-broker/preview-config'
import { activeBrokerRouteAdapter } from '@/lib/auth/social-broker/preview-runtime'

export const dynamic = 'force-dynamic'
/** Frozen callback ownership: the deployment profile derives Google here, never from query input. */
export async function GET(request: Request) {
  const config = loadUserLoginBrokerConfig()
  if (!config || new URL(request.url).origin !== config.issuer) return darkOidcRouteNotFound()
  const adapter = await activeBrokerRouteAdapter(request)
  return adapter ? adapter.callback('google', request) : darkOidcRouteNotFound()
}
