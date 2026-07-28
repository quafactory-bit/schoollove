import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'

export const USER_ACCESS_COOKIE = 'sl_user_access'
export const USER_REFRESH_COOKIE = 'sl_user_refresh'

type SessionTokens = {
  access_token: string
  refresh_token: string
  expires_in?: number
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
  response.cookies.set(USER_ACCESS_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  response.cookies.set(USER_REFRESH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}
