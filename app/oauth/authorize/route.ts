import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'
import { activeBrokerRouteAdapter } from '@/lib/auth/social-broker/preview-runtime'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) { const adapter = await activeBrokerRouteAdapter(request); return adapter ? adapter.authorize(request) : darkOidcRouteNotFound() }
