import { NextRequest, NextResponse } from 'next/server'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { requireConnectionContext } from '@/lib/api/connectionRoute'

export async function requireConnectionNotificationsContext(request: NextRequest) {
  const context = await requireConnectionContext(request)
  if ('response' in context) return context
  if (!await hasBetaFeatureAccess(context.auth.client, context.auth.user.id, 'connection_request')) {
    return { response: NextResponse.json({ error: 'LIMITED_BETA_ACCESS_REQUIRED' }, { status: 403 }) } as const
  }
  return context
}
