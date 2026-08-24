import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'
export const dynamic = 'force-dynamic'
/** Kakao is not a deployed login provider under the Google-only policy. */
export async function GET() { return darkOidcRouteNotFound() }
