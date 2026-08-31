import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'
import { activeBrokerRouteAdapter } from '@/lib/auth/social-broker/preview-runtime'

export const dynamic = 'force-dynamic'
/** Frozen callback ownership: the deployment profile derives Google here, never from query input. */
export async function GET(request: Request) { const adapter = await activeBrokerRouteAdapter(request); return adapter ? adapter.callback('google', request) : darkOidcRouteNotFound() }
