import { NextRequest, NextResponse } from 'next/server'
import {
  clearUserSessionCookies,
  revokeUserSession,
  USER_ACCESS_COOKIE,
  USER_REFRESH_COOKIE,
} from '@/lib/user-auth'

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(USER_ACCESS_COOKIE)?.value
  const refreshToken = request.cookies.get(USER_REFRESH_COOKIE)?.value
  try {
    await revokeUserSession(accessToken, refreshToken)
  } catch {
    // Local cookie removal remains authoritative for this device even if provider logout fails.
  }

  const response = NextResponse.json({ authenticated: false })
  clearUserSessionCookies(response)
  return response
}
