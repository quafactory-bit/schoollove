import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'
import { activePreviewRouteAdapter } from '@/lib/auth/social-broker/preview-runtime'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) { const adapter = await activePreviewRouteAdapter(request); return adapter ? adapter.jwks() : darkOidcRouteNotFound() }
