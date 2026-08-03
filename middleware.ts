import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import {
  clearUserSessionCookies,
  refreshUserSessionTokens,
  setUserSessionCookies,
  shouldRefreshUserSession,
  USER_ACCESS_COOKIE,
  USER_REFRESH_COOKIE,
} from '@/lib/user-auth'

function isUserSessionRoute(pathname: string) {
  return pathname === '/account' || pathname.startsWith('/account/')
    || pathname === '/onboarding' || pathname.startsWith('/onboarding/')
    || pathname.startsWith('/api/account/')
    || pathname === '/api/onboarding' || pathname.startsWith('/api/onboarding/')
}

async function refreshUserSession(request: NextRequest) {
  const accessToken = request.cookies.get(USER_ACCESS_COOKIE)?.value
  const refreshToken = request.cookies.get(USER_REFRESH_COOKIE)?.value
  const isApi = request.nextUrl.pathname.startsWith('/api/')
  if (!accessToken && !refreshToken && !isApi) {
    const login = new URL('/login', request.url)
    login.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }
  if (!shouldRefreshUserSession(accessToken, refreshToken)) return NextResponse.next()

  const session = refreshToken ? await refreshUserSessionTokens(refreshToken) : null
  if (!session) {
    request.cookies.delete(USER_ACCESS_COOKIE)
    request.cookies.delete(USER_REFRESH_COOKIE)
    const response = !isApi
      ? NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`,request.url))
      : NextResponse.next({ request: { headers: request.headers } })
    clearUserSessionCookies(response)
    response.headers.set('X-SchoolLove-Session', 'expired')
    return response
  }

  request.cookies.set(USER_ACCESS_COOKIE, session.access_token)
  request.cookies.set(USER_REFRESH_COOKIE, session.refresh_token)
  const response = NextResponse.next({ request: { headers: request.headers } })
  setUserSessionCookies(response, session)
  response.headers.set('X-SchoolLove-Session', 'refreshed')
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isUserSessionRoute(pathname)) return refreshUserSession(request)

  if (pathname.startsWith('/admin/login')) return NextResponse.next()

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) return NextResponse.redirect(new URL('/admin/login', request.url))

  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!token) return NextResponse.redirect(new URL('/admin/login', request.url))

  const isValid = await verifySessionToken(token, adminPassword)
  if (!isValid) {
    const response = NextResponse.redirect(new URL('/admin/login', request.url))
    response.cookies.delete(ADMIN_COOKIE_NAME)
    return response
  }

  const response = NextResponse.next()
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  return response
}

export const config = {
  matcher: [
    '/admin','/admin/:path*',
    '/account','/account/:path*','/onboarding','/onboarding/:path*',
    '/api/account/:path*','/api/onboarding','/api/onboarding/:path*',
  ],
}
