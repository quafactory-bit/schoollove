import { NextResponse } from 'next/server'
import { darkOidcRouteNotFound } from '@/lib/auth/social-broker/http'

const PREVIEW_ORIGIN = 'https://preview.schoollove.kr'
const SUPABASE_AUTHORITY = 'https://hukokfyphyrpfouazxhq.supabase.co'
const COMPLETION_ROUTE = `${PREVIEW_ORIGIN}/auth/social/complete`

/** Fixed first-party start: request data never selects provider, issuer, or return URL. */
export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview' || new URL(request.url).origin !== PREVIEW_ORIGIN) {
    return darkOidcRouteNotFound()
  }

  const destination = new URL('/auth/v1/authorize', SUPABASE_AUTHORITY)
  destination.searchParams.set('provider', 'custom:schoollove-google')
  destination.searchParams.set('redirect_to', COMPLETION_ROUTE)
  return NextResponse.redirect(destination, 302)
}
