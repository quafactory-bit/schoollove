import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { isFutureGraduationYear } from '@/lib/policy/operations'
import { syncOnboardingProgressSafely } from '@/lib/onboarding'
import { getSafeMembershipError, hasPublicAccountWriteAccess } from '@/lib/publicAccountLaunch'

const GradeClassSchema = z.object({
  grade_number: z.number().int().min(1).max(6),
  class_number: z.number().int().min(1).max(100),
}).strict()

const MembershipSchema = z.object({
  school_id: z.string().uuid(),
  graduation_year: z.number().int().min(1900).max(2200),
  grade_classes: z.array(GradeClassSchema).max(6),
}).strict().superRefine((value, context) => {
  const grades = value.grade_classes.map((row) => row.grade_number)
  if (new Set(grades).size !== grades.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate grade' })
  }
})
const DeleteSchema = z.object({ membership_id: z.string().uuid() })
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const parsed = MembershipSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '학교 이력 입력값을 확인해 주세요.' }, { status: 400 })

  if (isFutureGraduationYear(parsed.data.graduation_year)) return NextResponse.json({ error: '미래 졸업연도는 저장할 수 없습니다.' }, { status: 400 })
  const writeAllowed = await hasPublicAccountWriteAccess(auth.client,auth.user.id,'school_membership')
  if (!writeAllowed) return NextResponse.json({error:'학교 이력 저장은 아직 준비 중입니다.'},{status:403})

  const { data: access } = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
  if (access !== true) return NextResponse.json({ error: '성인 확인과 필수 동의가 필요합니다.' }, { status: 403 })

  const { data: profile } = await auth.client
    .from('private_profiles')
    .select('id')
    .eq('owner_user_id', auth.user.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: '내 프로필을 먼저 만들어 주세요.' }, { status: 409 })

  // owner_user_id and profile_id are derived inside the database from auth.uid().
  const { data, error } = await auth.client.rpc('add_own_school_membership_with_class_history', {
    requested_school_id: parsed.data.school_id,
    requested_graduation_year: parsed.data.graduation_year,
    requested_grade_classes: parsed.data.grade_classes,
  })
  if (error) {
    const safeMessage=getSafeMembershipError(error)
    if(safeMessage)return NextResponse.json({error:safeMessage},{status:409})
    return NextResponse.json({ error: '학교 이력을 저장할 수 없습니다.' }, { status: 500 })
  }
  await syncOnboardingProgressSafely(auth.client,auth.user.id,'direct')
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

  const { error } = await auth.client.rpc('delete_own_school_membership', {
    target_membership_id: parsed.data.membership_id,
  })
  if (error) return NextResponse.json({ error: '학교 이력을 삭제할 수 없습니다.' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
