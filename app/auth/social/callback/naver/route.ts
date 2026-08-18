import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'
import { activePreviewRouteAdapter } from '@/lib/auth/social-broker/preview-runtime'

export const dynamic = 'force-dynamic'
/** Frozen callback ownership: a future Preview-only adapter derives Naver here, never from query input. */
export async function GET(request: Request) { const adapter = await activePreviewRouteAdapter(request); return adapter ? adapter.callback('naver', request) : darkOidcRouteNotFound() }
