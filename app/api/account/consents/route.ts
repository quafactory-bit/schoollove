import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { ACCOUNT_POLICY_VERSION, REQUIRED_CONSENT_TYPES } from '@/lib/policy/accountPolicy'
import { syncOnboardingProgressSafely } from '@/lib/onboarding'

const ConsentSchema = z.object({
  terms: z.literal(true),
  privacy_collection: z.literal(true),
  adult_confirmation: z.literal(true),
  private_by_default: z.literal(true),
  instagram_publication: z.boolean().optional(),
  marketing: z.boolean().optional(),
  today_instagram_promotion: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

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

  const optional = ['instagram_publication', 'marketing', 'today_instagram_promotion'] as const
  const records = [
    ...REQUIRED_CONSENT_TYPES.map((consentType) => ({
      user_id: auth.user.id,
      consent_type: consentType,
      consented: true,
      policy_version: ACCOUNT_POLICY_VERSION,
    })),
    ...optional.map((consentType) => ({
      user_id: auth.user.id,
      consent_type: consentType,
      consented: parsed.data[consentType] ?? false,
      policy_version: ACCOUNT_POLICY_VERSION,
    })),
  ]

  const { error } = await auth.client.from('consent_records').insert(records)
  if (error) return NextResponse.json({ error: '동의 기록을 저장할 수 없습니다.' }, { status: 500 })
  await syncOnboardingProgressSafely(auth.client,auth.user.id,'direct')
  return NextResponse.json({ consentsComplete: true })
}
