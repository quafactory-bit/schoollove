import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { isAdultEligibleInKst } from '@/lib/policy/adultEligibility'
import { ACCOUNT_POLICY_VERSION } from '@/lib/policy/accountPolicy'
import { getSupabaseAdmin } from '@/lib/supabase'
import { syncOnboardingProgressSafely } from '@/lib/onboarding'

const EligibilitySchema = z.object({ dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const parsed = EligibilitySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '생년월일을 확인해 주세요.' }, { status: 400 })

  // dateOfBirth is used only in memory for this calculation and is never inserted or logged.
  if (!isAdultEligibleInKst(parsed.data.dateOfBirth)) {
    return NextResponse.json({ error: '만 19세 이상만 개인 기능을 사용할 수 있습니다.' }, { status: 403 })
  }

  // Only this server route can create an eligibility row. Direct authenticated INSERT is
  // intentionally revoked so the KST age calculation above cannot be bypassed via REST.
  let admin: ReturnType<typeof getSupabaseAdmin>
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: '성인 확인을 저장할 수 없습니다.' }, { status: 503 })
  }

  const { error } = await admin.from('adult_eligibility_records').insert({
    user_id: auth.user.id,
    adult_eligible: true,
    verification_method: 'self_attestation',
    policy_version: ACCOUNT_POLICY_VERSION,
  })
  if (error) return NextResponse.json({ error: '성인 확인을 저장할 수 없습니다.' }, { status: 500 })

  await syncOnboardingProgressSafely(admin,auth.user.id,'direct')

  return NextResponse.json({ adultEligible: true, rawInputStored: false })
}
