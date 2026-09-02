import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConnectionContext } from '@/lib/api/connectionRoute'
import { getConnectionInstagramState, setInstagramPermission } from '@/lib/connections'

const IdSchema = z.string().uuid()
const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

const unavailable = () => NextResponse.json(
  { error: '연결을 확인할 수 없습니다.' },
  { status: 404, headers: noStoreHeaders },
)

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConnectionContext(request, 'instagram')
  if ('response' in context && context.response) {
    context.response.headers.set('Cache-Control', noStoreHeaders['Cache-Control'])
    return context.response
  }
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return unavailable()
  const state = await getConnectionInstagramState(context.auth.user.id, id.data)
  return state ? NextResponse.json(state, { headers: noStoreHeaders }) : unavailable()
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return changePermission(request, params, true)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return changePermission(request, params, false)
}

async function changePermission(request: NextRequest, params: Promise<{ id: string }>, visible: boolean) {
  const context = await requireConnectionContext(request, 'instagram')
  if ('response' in context && context.response) {
    context.response.headers.set('Cache-Control', noStoreHeaders['Cache-Control'])
    return context.response
  }
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return unavailable()
  const state = await getConnectionInstagramState(context.auth.user.id, id.data)
  if (!state) return unavailable()
  if (visible && !state.myInstagramConfigured) {
    return NextResponse.json(
      { error: 'INSTAGRAM_HANDLE_REQUIRED' },
      { status: 409, headers: noStoreHeaders },
    )
  }
  if (state.myInstagramVisible === visible) {
    return NextResponse.json({ myInstagramVisible: visible }, { headers: noStoreHeaders })
  }
  const changed = await setInstagramPermission(context.auth.user.id, id.data, visible)
  return changed
    ? NextResponse.json({ myInstagramVisible: visible }, { headers: noStoreHeaders })
    : unavailable()
}
