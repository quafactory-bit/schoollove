import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { checkConnectionRateLimit, getRequestIp, type ConnectionRateAction } from '@/lib/security/connectionRateLimit'

export async function requireConnectionContext(request: NextRequest, action?: ConnectionRateAction) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return { response: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) } as const
  if (!action) return { auth } as const
  const rate = await checkConnectionRateLimit({ ip: getRequestIp(request), userId: auth.user.id, action })
  if (!rate.allowed) {
    const response = NextResponse.json({ error: rate.status === 503 ? '안전 설정을 확인하는 동안 잠시 이용할 수 없습니다.' : '요청이 너무 많습니다.' }, { status: rate.status })
    if (rate.retryAfter) response.headers.set('Retry-After', String(rate.retryAfter))
    return { response } as const
  }
  return { auth } as const
}

export async function readJson(request: NextRequest): Promise<unknown | null> {
  try { return await request.json() } catch { return null }
}
