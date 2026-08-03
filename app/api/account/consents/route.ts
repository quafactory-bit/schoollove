import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { ACCOUNT_POLICY_VERSION, REQUIRED_CONSENT_TYPES } from '@/lib/policy/accountPolicy'
import { syncOnboardingProgressSafely } from '@/lib/onboarding'
import { getSupabaseAdmin } from '@/lib/supabase'
import { hasPublicAccountFeatureAccess, recordPublicAccountEvent } from '@/lib/publicAccountLaunch'
import { hasBetaFeatureAccess } from '@/lib/beta'

const ConsentSchema = z.object({
  terms: z.literal(true),
  privacy_collection: z.literal(true),
  adult_confirmation: z.literal(true),
  private_by_default: z.literal(true),
}).strict()

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const writeAllowed = await hasPublicAccountFeatureAccess(auth.client,'private_profile')
    || await hasBetaFeatureAccess(auth.client,auth.user.id,'private_profile')
  if (!writeAllowed) return NextResponse.json({ error:'계정 설정은 아직 준비 중입니다.' },{status:403})

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const parsed = ConsentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '필수 동의를 모두 확인해 주세요.' }, { status: 400 })

  const { data: eligibility } = await auth.client
    .from('adult_eligibility_records')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('adult_eligible', true)
    .eq('policy_version', ACCOUNT_POLICY_VERSION)
    .limit(1)
  if (!eligibility?.length) {
    return NextResponse.json({ error: '성인 확인이 먼저 필요합니다.' }, { status: 403 })
  }

  const records = REQUIRED_CONSENT_TYPES.map((consentType) => ({
      user_id: auth.user.id,
      consent_type: consentType,
      consented: true,
      policy_version: ACCOUNT_POLICY_VERSION,
    }))

  const { error } = await getSupabaseAdmin().from('consent_records').upsert(records,{
    onConflict:'user_id,consent_type,policy_version',ignoreDuplicates:true,
  })
  if (error) return NextResponse.json({ error: '동의 기록을 저장할 수 없습니다.' }, { status: 500 })
  await syncOnboardingProgressSafely(auth.client,auth.user.id,'direct')
  await recordPublicAccountEvent('required_consents_completed','onboarding')
  return NextResponse.json({ consentsComplete: true })
}
