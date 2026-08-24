import { NextResponse } from 'next/server'

const SUPABASE_AUTHORITY = 'https://hukokfyphyrpfouazxhq.supabase.co'
const COMPLETION_ROUTE = 'https://preview.schoollove.kr/auth/social/complete'

/** Fixed first-party start: request data never selects provider, issuer, or return URL. */
export async function GET(_request: Request) {
  const destination = new URL('/auth/v1/authorize', SUPABASE_AUTHORITY)
  destination.searchParams.set('provider', 'custom:schoollove-google')
  destination.searchParams.set('redirect_to', COMPLETION_ROUTE)
  return NextResponse.redirect(destination)
}
