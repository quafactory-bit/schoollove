import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { hasClassHistorySelfServiceWriteAccess } from '@/lib/classHistoryAccess'

const History = z.array(z.object({
  grade_number: z.number().int().min(1).max(6),
  class_number: z.number().int().min(1).max(100),
}).strict()).max(6).refine(rows => new Set(rows.map(row => row.grade_number)).size === rows.length)
const Body = z.object({ grade_classes: History }).strict()
const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
const failure = (status: number) => NextResponse.json({ error: '학년·반 정보를 저장할 수 없습니다.' }, { status, headers })

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth) return failure(401)
  const id = z.string().uuid().safeParse((await params).id)
  const body = Body.safeParse(await request.json().catch(() => null))
  if (!id.success || !body.success) return failure(400)
  try {
    if (!await hasClassHistorySelfServiceWriteAccess(auth.client, auth.user.id)) return failure(403)
    const access = await auth.client.rpc('has_current_adult_access', { target_user_id: auth.user.id })
    if (access.error || access.data !== true) return failure(403)
    const { data, error } = await auth.client.rpc('replace_own_school_class_history', {
      target_membership_id: id.data,
      requested_grade_classes: body.data.grade_classes,
    })
    if (error) return failure(error.message === 'CLASS_HISTORY_UNAVAILABLE' ? 403 : 500)
    const result = History.safeParse(data)
    if (!result.success) return failure(500)
    return NextResponse.json({ classHistory: result.data }, { headers })
  } catch {
    return failure(500)
  }
}
