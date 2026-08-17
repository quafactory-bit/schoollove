import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'

export const dynamic = 'force-dynamic'
/** Frozen callback ownership: a future Preview-only adapter derives Kakao here, never from query input. */
export function GET() { return darkOidcRouteNotFound() }
