import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { OnboardingQuerySchema } from '@/lib/policy/onboarding'
import { syncOnboardingProgress } from '@/lib/onboarding'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers: privateHeaders })
  const parsed = OnboardingQuerySchema.safeParse({ source: request.nextUrl.searchParams.get('source') ?? 'unknown' })
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_ONBOARDING_SOURCE' }, { status: 400, headers: privateHeaders })
  const state = await syncOnboardingProgress(auth.client,auth.user.id,parsed.data.source)
  return state
    ? NextResponse.json({ state }, { headers: privateHeaders })
    : NextResponse.json({ error: 'ONBOARDING_STATE_UNAVAILABLE' }, { status: 503, headers: privateHeaders })
}
