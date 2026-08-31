import { NextResponse } from 'next/server'
import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'
import { loadBrokerConfig } from '@/lib/auth/social-broker/preview-config'

/** Fixed first-party start: request data never selects provider, issuer, or return URL. */
export async function GET(request: Request) {
  try {
    const config = loadBrokerConfig()
    if (config.exposure === 'off' || new URL(request.url).origin !== config.issuer) return darkOidcRouteNotFound()
    const destination = new URL('/auth/v1/authorize', config.supabaseAuthority)
    destination.searchParams.set('provider', 'custom:schoollove-google')
    destination.searchParams.set('redirect_to', config.completionRoute)
    return NextResponse.redirect(destination, 302)
  } catch { return darkOidcRouteNotFound() }
}
