import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { syncOnboardingProgressSafely } from '@/lib/onboarding'
import { hasAccountOnboardingWriteAccess } from '@/lib/publicAccountLaunch'

const safeText = z.string().transform((value)=>value.normalize('NFKC').trim())
  .refine((value)=>!/[\p{Cc}\p{Cf}]/u.test(value),'control characters are not allowed')

const ProfileSchema = z.object({
  display_name: safeText.pipe(z.string().min(1).max(50)),
  instagram_handle: z.string().trim().regex(/^[A-Za-z0-9._]{1,30}$/).nullable().optional(),
  introduction: safeText.pipe(z.string().max(300)).nullable().optional(),
}).strict()

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await auth.client
    .from('private_profiles')
    .select('id, display_name, instagram_handle, profile_photo_url, introduction, profile_visibility, status, created_at, updated_at')
    .eq('owner_user_id', auth.user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: '내 프로필을 불러올 수 없습니다.' }, { status: 500 })
  return NextResponse.json({ profile: data ?? null })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const writeAllowed = await hasAccountOnboardingWriteAccess(
    auth.client,auth.user.id,'private_profile','private_profile',
  )
  if (!writeAllowed) return NextResponse.json({error:'비공개 프로필 저장은 아직 준비 중입니다.'},{status:403})

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const parsed = ProfileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '프로필 입력값을 확인해 주세요.' }, { status: 400 })

  const { data: access, error: accessError } = await auth.client.rpc('has_current_adult_access', {
    target_user_id: auth.user.id,
  })
  if (accessError || access !== true) {
    return NextResponse.json({ error: '성인 확인과 필수 동의가 필요합니다.' }, { status: 403 })
  }

  // Ownership and protected columns are derived and forced inside the database RPC.
  const { data, error } = await auth.client.rpc('upsert_own_private_profile', {
    requested_display_name: parsed.data.display_name,
    requested_instagram_handle: parsed.data.instagram_handle || null,
    requested_introduction: parsed.data.introduction || null,
  })
  if (error) return NextResponse.json({ error: '내 프로필을 저장할 수 없습니다.' }, { status: 500 })
  await syncOnboardingProgressSafely(auth.client,auth.user.id,'direct')
  return NextResponse.json({ profile: data })
}

export const PATCH = POST

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { error } = await auth.client.rpc('delete_own_private_profile')
  if (error) return NextResponse.json({ error: '내 프로필을 삭제할 수 없습니다.' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
