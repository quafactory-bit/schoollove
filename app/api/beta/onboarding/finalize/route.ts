import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { recordLimitedLaunchEvent, syncOnboardingProgressSafely } from '@/lib/onboarding'

export async function POST(request:NextRequest){
  const auth=await getAuthenticatedRequestContext(request)
  if(!auth)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401})
  const admin=getSupabaseAdmin()
  const {data,error}=await admin.rpc('finalize_beta_onboarding_claim',{
    actor_user_id:auth.user.id,
  })
  if(error||data==='UNAVAILABLE'){
    return NextResponse.json({error:'BETA_ONBOARDING_UNAVAILABLE'},{status:409})
  }
  if(data==='ONBOARDING_REQUIRED'){
    return NextResponse.json({error:'ONBOARDING_REQUIRED'},{status:409})
  }
  if(data!=='PENDING_REVIEW'){
    return NextResponse.json({error:'BETA_ONBOARDING_UNAVAILABLE'},{status:409})
  }
  await syncOnboardingProgressSafely(admin,auth.user.id,'direct')
  await recordLimitedLaunchEvent('invite_redeemed')
  return NextResponse.json({status:'PENDING_REVIEW'})
}
