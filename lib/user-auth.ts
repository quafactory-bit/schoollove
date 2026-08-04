import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'

export const USER_ACCESS_COOKIE = 'sl_user_access'
export const USER_REFRESH_COOKIE = 'sl_user_refresh'

export type SessionTokens = {
  access_token: string
  refresh_token: string
  expires_in?: number
}

export function getAccessTokenExpiry(accessToken: string | undefined): number | null {
  if (!accessToken) return null
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized)) as { exp?: unknown }
    return typeof decoded.exp === 'number' && Number.isFinite(decoded.exp) ? decoded.exp : null
  } catch {
    return null
  }
}

export function shouldRefreshUserSession(
  accessToken: string | undefined,
  refreshToken: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!refreshToken) return false
  const expiry = getAccessTokenExpiry(accessToken)
  return !accessToken || expiry === null || expiry <= nowSeconds + 60
}

function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Public Supabase auth configuration is missing')
  return { url, anonKey }
}

export function createPublicAuthClient(): SupabaseClient {
  const { url, anonKey } = getPublicSupabaseConfig()
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export function createAuthenticatedSupabase(accessToken: string): SupabaseClient {
  const { url, anonKey } = getPublicSupabaseConfig()
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

async function verifyAccessToken(accessToken: string | undefined): Promise<{
  user: User
  client: SupabaseClient
} | null> {
  if (!accessToken) return null
  const client = createAuthenticatedSupabase(accessToken)
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) return null
  const { data: blockedDeletion } = await client
    .from('account_deletion_requests')
    .select('id')
    .eq('user_id', data.user.id)
    .neq('status', 'rejected')
    .limit(1)
  if (blockedDeletion?.length) return null
  return { user: data.user, client }
}

export async function getAuthenticatedRequestContext(request: NextRequest) {
  return verifyAccessToken(request.cookies.get(USER_ACCESS_COOKIE)?.value)
}

export async function getAuthenticatedServerContext() {
  const store = await cookies()
  return verifyAccessToken(store.get(USER_ACCESS_COOKIE)?.value)
}

export function setUserSessionCookies(response: NextResponse, session: SessionTokens): void {
  const secure = process.env.NODE_ENV === 'production'
  response.cookies.set(USER_ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(60, Math.min(session.expires_in ?? 3600, 3600)),
  })
  response.cookies.set(USER_REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function clearUserSessionCookies(response: NextResponse): void {
  const secure = process.env.NODE_ENV === 'production'
  response.cookies.set(USER_ACCESS_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 })
  response.cookies.set(USER_REFRESH_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 })
}

export async function refreshUserSessionTokens(refreshToken: string): Promise<SessionTokens | null> {
  try {
    const client = createPublicAuthClient()
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data.session?.access_token || !data.session.refresh_token) return null
    return data.session
  } catch {
    return null
  }
}

export async function revokeUserSession(
  accessToken: string | undefined,
  refreshToken: string | undefined
): Promise<void> {
  if (!accessToken || !refreshToken) return
  const client = createPublicAuthClient()
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (error) return
  await client.auth.signOut({ scope: 'global' })
}
