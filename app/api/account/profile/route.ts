import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'

const ProfileSchema = z.object({
  display_name: z.string().transform((value) => value.normalize('NFKC').trim()).pipe(z.string().min(1).max(50)),
  instagram_handle: z.string().trim().regex(/^[A-Za-z0-9._]{1,30}$/).nullable().optional(),
  profile_photo_url: z.string().trim().url().max(500).nullable().optional(),
  introduction: z.string().trim().max(300).nullable().optional(),
})

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

  // Any user_id supplied in the request body is ignored; ownership comes only from the verified session.
  const { data, error } = await auth.client
    .from('private_profiles')
    .upsert({
      owner_user_id: auth.user.id,
      display_name: parsed.data.display_name,
      instagram_handle: parsed.data.instagram_handle || null,
      profile_photo_url: parsed.data.profile_photo_url || null,
      introduction: parsed.data.introduction || null,
      profile_visibility: 'private',
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_user_id' })
    .select('id, display_name, instagram_handle, profile_photo_url, introduction, profile_visibility, status, created_at, updated_at')
    .single()
  if (error) return NextResponse.json({ error: '내 프로필을 저장할 수 없습니다.' }, { status: 500 })
  return NextResponse.json({ profile: data })
}

export const PATCH = POST

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { error } = await auth.client
    .from('private_profiles')
    .delete()
    .eq('owner_user_id', auth.user.id)
  if (error) return NextResponse.json({ error: '내 프로필을 삭제할 수 없습니다.' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
