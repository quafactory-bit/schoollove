import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'
export const dynamic = 'force-dynamic'
export function POST() { return darkOidcRouteNotFound() }
