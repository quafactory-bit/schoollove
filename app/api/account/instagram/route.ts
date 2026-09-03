import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'

const InstagramSchema = z.object({
  instagram_handle: z.string().trim().regex(/^[A-Za-z0-9._]{1,30}$/).nullable(),
}).strict()

function privateJson(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function safeRpcError(message: string | undefined) {
  if (message?.includes('PRIVATE_PROFILE_REQUIRED')) {
    return privateJson({ error: '기존 비공개 프로필이 필요합니다.' }, 409)
  }
  if (message?.includes('CONNECTED_INSTAGRAM_ACCESS_REQUIRED')) {
    return privateJson({ error: '현재 Instagram 설정 권한이 없습니다.' }, 403)
  }
  if (message?.includes('INVALID_INSTAGRAM_HANDLE')) {
    return privateJson({ error: 'Instagram 아이디 형식을 확인해 주세요.' }, 400)
  }
  return privateJson({ error: 'Instagram 아이디를 저장할 수 없습니다.' }, 500)
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return privateJson({ error: '잘못된 요청입니다.' }, 400)
  }

  const parsed = InstagramSchema.safeParse(body)
  if (!parsed.success) {
    return privateJson({ error: 'Instagram 아이디 형식을 확인해 주세요.' }, 400)
  }

  const { data, error } = await auth.client.rpc('update_own_connected_instagram_handle', {
    requested_instagram_handle: parsed.data.instagram_handle,
  })
  if (error) return safeRpcError(error.message)
  if (data !== true) return privateJson({ error: 'Instagram 아이디를 저장할 수 없습니다.' }, 500)

  return privateJson({ updated: true })
}
