import { NextRequest, NextResponse } from 'next/server'
import { BetaInviteRedeemSchema } from '@/lib/policy/operations'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { hashBetaIdentity } from '@/lib/beta'
import { recordLimitedLaunchEvent, syncOnboardingProgressSafely } from '@/lib/onboarding'

export async function POST(request:NextRequest){
  const auth=await getAuthenticatedRequestContext(request)
  if(!auth)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401})
  const parsed=BetaInviteRedeemSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return NextResponse.json({error:'INVALID_INVITE'},{status:400})

  const email=auth.user.email||null
  const domain=email?.split('@')[1]||null
  const admin=getSupabaseAdmin()
  const parameters={
    actor_user_id:auth.user.id,
    requested_token_hash:hashBetaIdentity(parsed.data.token),
    actor_email_hash:email?hashBetaIdentity(email):null,
    actor_domain_hash:domain?hashBetaIdentity(domain):null,
  }
  const claim=await admin.rpc('claim_beta_invite_for_onboarding',parameters)
  if(claim.error)return NextResponse.json({error:'INVITE_UNAVAILABLE'},{status:409})

  if(claim.data==='LEGACY_CONTRACT'){
    const legacy=await admin.rpc('redeem_beta_invite',parameters)
    if(legacy.error)return NextResponse.json({error:'INVITE_UNAVAILABLE'},{status:409})
    await syncOnboardingProgressSafely(admin,auth.user.id,'direct')
    await recordLimitedLaunchEvent('invite_redeemed')
    return NextResponse.json({status:legacy.data,mode:'legacy'})
  }
  if(claim.data!=='ONBOARDING_CLAIMED'){
    return NextResponse.json({error:'INVITE_UNAVAILABLE'},{status:409})
  }
  return NextResponse.json({status:'ONBOARDING_CLAIMED',mode:'onboarding'})
}
