import { getSupabaseAdmin } from '@/lib/supabase'

export type BetaOnboardingState='none'|'claimed'|'pending_review'|'active'

export async function getBetaOnboardingState(userId:string):Promise<BetaOnboardingState>{
  try{
    const admin=getSupabaseAdmin()
    const [claimResult,memberResult]=await Promise.all([
      admin.from('beta_onboarding_invite_claims')
        .select('status,expires_at')
        .eq('user_id',userId)
        .order('created_at',{ascending:false})
        .limit(1)
        .maybeSingle(),
      admin.from('beta_members')
        .select('status,program_id')
        .eq('user_id',userId)
        .in('status',['pending_review','active'])
        .limit(1)
        .maybeSingle(),
    ])
    if(memberResult.data){
      const snapshot=await admin.from('beta_program_setup_snapshots')
        .select('enabled_features')
        .eq('program_id',memberResult.data.program_id)
        .maybeSingle()
      const features=snapshot.data?.enabled_features
      const peopleDiscovery=Array.isArray(features)&&features.length===2
        &&features.includes('people_search')&&features.includes('connection_request')
      if(peopleDiscovery&&memberResult.data.status==='active')return 'active'
      if(peopleDiscovery&&memberResult.data.status==='pending_review')return 'pending_review'
    }
    const claim=claimResult.data
    if(claim?.status==='claimed'&&new Date(claim.expires_at).getTime()>Date.now())return 'claimed'
  }catch{
    // A missing migration or unavailable admin boundary must keep onboarding closed.
  }
  return 'none'
}
