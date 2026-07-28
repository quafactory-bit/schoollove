import { NextRequest, NextResponse } from 'next/server'
import { clearUserSessionCookies, createAuthenticatedSupabase, USER_ACCESS_COOKIE } from '@/lib/user-auth'

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(USER_ACCESS_COOKIE)?.value
  if (accessToken) {
    try {
      await createAuthenticatedSupabase(accessToken).auth.signOut()
    } catch {
      // Local cookie removal remains authoritative for this device.
    }
  }

  const response = NextResponse.json({ authenticated: false })
  clearUserSessionCookies(response)
  return response
}
