import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { checkConnectionRateLimit, getRequestIp, type ConnectionRateAction } from '@/lib/security/connectionRateLimit'
import { hasBetaFeatureAccess } from '@/lib/beta'
import type { BetaFeatureKey } from '@/lib/policy/operations'
import { hasPublicAccountAccessActive } from '@/lib/publicAccountLaunch'

const featuresForAction: Partial<Record<ConnectionRateAction, readonly BetaFeatureKey[]>> = {
  search: ['people_search'],
  request: ['people_search','connection_request'],
  reminder: ['people_search','connection_request'],
  response: ['people_search','connection_request'],
  message: ['messaging'],
  instagram: ['instagram_permission'],
}

const publicActiveActions = new Set<ConnectionRateAction>(['search','request','reminder'])

type AuthenticatedConnectionContext = NonNullable<Awaited<ReturnType<typeof getAuthenticatedRequestContext>>>

export async function requireConnectionActionContext(
  request: NextRequest,
  auth: AuthenticatedConnectionContext,
  action: ConnectionRateAction,
  requiredFeatures?: readonly BetaFeatureKey[],
  options?: { requirePublicAccountActive?: boolean },
) {
  for (const feature of requiredFeatures ?? featuresForAction[action] ?? []) {
    if (!(await hasBetaFeatureAccess(auth.client, auth.user.id, feature))) {
      return { response: NextResponse.json({ error: 'LIMITED_BETA_ACCESS_REQUIRED' }, { status: 403 }) } as const
    }
  }
  if ((options?.requirePublicAccountActive ?? publicActiveActions.has(action))
    && !(await hasPublicAccountAccessActive(auth.client,auth.user.id))) {
    return { response: NextResponse.json({ error: 'PUBLIC_ACCOUNT_ACCESS_INACTIVE' }, { status: 403 }) } as const
  }
  const rate = await checkConnectionRateLimit({ ip: getRequestIp(request), userId: auth.user.id, action })
  if (!rate.allowed) {
    const response = NextResponse.json({ error: rate.status === 503 ? '안전 설정을 확인하는 동안 잠시 이용할 수 없습니다.' : '요청이 너무 많습니다.' }, { status: rate.status })
    if (rate.retryAfter) response.headers.set('Retry-After', String(rate.retryAfter))
    return { response } as const
  }
  return { auth } as const
}

export async function requireConnectionContext(
  request: NextRequest,
  action?: ConnectionRateAction,
  requiredFeatures?: readonly BetaFeatureKey[],
) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return { response: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) } as const
  if (!action) return { auth } as const
  return requireConnectionActionContext(request,auth,action,requiredFeatures)
}

export async function readJson(request: NextRequest): Promise<unknown | null> {
  try { return await request.json() } catch { return null }
}
