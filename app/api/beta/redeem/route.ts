import { NextRequest, NextResponse } from 'next/server'
import { BetaInviteRedeemSchema } from '@/lib/policy/operations'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { hashBetaIdentity } from '@/lib/beta'

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestContext(request)
  if (!auth || !auth.user.email) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
  const parsed = BetaInviteRedeemSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INVITE' }, { status: 400 })
  const domain = auth.user.email.split('@')[1] || ''
  const { data, error } = await getSupabaseAdmin().rpc('redeem_beta_invite', {
    actor_user_id: auth.user.id,
    requested_token_hash: hashBetaIdentity(parsed.data.token),
    actor_email_hash: hashBetaIdentity(auth.user.email),
    actor_domain_hash: hashBetaIdentity(domain),
  })
  if (error) return NextResponse.json({ error: 'INVITE_REDEEM_FAILED' }, { status: 409 })
  return NextResponse.json({ status: data })
}
