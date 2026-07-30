import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { isFutureGraduationYear } from '@/lib/policy/operations'
import { recordLimitedLaunchEvent, syncOnboardingProgressSafely } from '@/lib/onboarding'

const MembershipSchema = z.object({
  school_id: z.string().uuid(),
  graduation_year: z.number().int().min(1900).max(2200),
  class_number: z.number().int().min(1).max(100).nullable().optional(),
})
const DeleteSchema = z.object({ membership_id: z.string().uuid() })
const controlledBetaMembershipErrors = new Set(['SCHOOL_OUTSIDE_BETA_SCOPE','SECOND_SCHOOL_NOT_ALLOWED','ACTIVE_CONTROLLED_BETA_MEMBERSHIP_REQUIRED'])

function controlledBetaMembershipError(error:{message?:string}|null){
  const code=error?.message?.match(/\b[A-Z][A-Z0-9_]{1,59}\b/)?.[0]
  return code&&controlledBetaMembershipErrors.has(code)?code:null
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const parsed = MembershipSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '학교 이력 입력값을 확인해 주세요.' }, { status: 400 })

  if (isFutureGraduationYear(parsed.data.graduation_year)) return NextResponse.json({ error: 'FUTURE_GRADUATION_YEAR_NOT_ALLOWED' }, { status: 400 })
  if (!(await hasBetaFeatureAccess(auth.client, auth.user.id, 'private_profile'))) return NextResponse.json({ error: 'LIMITED_BETA_ACCESS_REQUIRED' }, { status: 403 })

  const { data: access } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (access !== true) return NextResponse.json({ error: '성인 확인과 필수 동의가 필요합니다.' }, { status: 403 })

  const { data: profile } = await auth.client
    .from('private_profiles')
    .select('id')
    .eq('owner_user_id', auth.user.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: '내 프로필을 먼저 만들어 주세요.' }, { status: 409 })

  // owner_user_id and profile_id are derived from the verified session, never from request input.
  const { data, error } = await auth.client.from('profile_school_memberships').insert({
    profile_id: profile.id,
    owner_user_id: auth.user.id,
    school_id: parsed.data.school_id,
    graduation_year: parsed.data.graduation_year,
    class_number: parsed.data.class_number ?? null,
  }).select('id').single()
  if (error) {
    const safeCode=controlledBetaMembershipError(error)
    if(safeCode)return NextResponse.json({error:safeCode},{status:409})
    return NextResponse.json({ error: '학교 이력을 저장할 수 없습니다.' }, { status: 500 })
  }
  await syncOnboardingProgressSafely(auth.client,auth.user.id,'direct')
  await recordLimitedLaunchEvent('school_membership_saved')
  return NextResponse.json({ membership: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const parsed = DeleteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '학교 이력을 확인해 주세요.' }, { status: 400 })

  const { error } = await auth.client.from('profile_school_memberships').delete()
    .eq('id', parsed.data.membership_id)
    .eq('owner_user_id', auth.user.id)
  if (error) return NextResponse.json({ error: '학교 이력을 삭제할 수 없습니다.' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
