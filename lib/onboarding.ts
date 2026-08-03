import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingSource } from '@/lib/policy/onboarding'
import { getAccountState } from '@/lib/account'
import { hasPublicAccountFeatureAccess } from '@/lib/publicAccountLaunch'

async function hasPrivateBetaAccess(client:SupabaseClient,userId:string) {
  const {data,error}=await client.rpc('has_beta_feature_access',{
    target_user_id:userId,requested_feature:'private_profile',
  })
  return !error&&data===true
}

export type OnboardingStage =
  | 'access_paused' | 'adult_required' | 'consent_required'
  | 'profile_required' | 'school_required' | 'ready'

export type OnboardingState = {
  stage: OnboardingStage
  adultReady: boolean
  consentsReady: boolean
  profileReady: boolean
  schoolReady: boolean
  complete: boolean
  source?: OnboardingSource
}

export async function syncOnboardingProgress(
  client: SupabaseClient,
  userId: string,
  source: OnboardingSource = 'unknown',
): Promise<OnboardingState | null> {
  const [account,publicAccess,betaAccess] = await Promise.all([
    getAccountState(client,userId),
    hasPublicAccountFeatureAccess(client,'private_profile'),
    hasPrivateBetaAccess(client,userId),
  ])
  const writable = publicAccess || betaAccess
  const stage:OnboardingStage = account.deletionStatus || !writable ? 'access_paused'
    : !account.adultEligible ? 'adult_required'
      : !account.consentsComplete ? 'consent_required'
        : !account.profile ? 'profile_required'
          : account.memberships.length===0 ? 'school_required' : 'ready'
  return {
    stage,
    adultReady:account.adultEligible,
    consentsReady:account.consentsComplete,
    profileReady:Boolean(account.profile),
    schoolReady:account.memberships.length>0,
    complete:stage==='ready',
    source,
  }
}

export async function syncOnboardingProgressSafely(
  client: SupabaseClient,
  userId: string,
  source: OnboardingSource = 'unknown',
) {
  try { return await syncOnboardingProgress(client,userId,source) } catch { return null }
}

export const limitedLaunchEvents=[
  'invite_redeemed','private_profile_saved','school_membership_saved',
  'people_search_completed','connection_request_created',
] as const
export type LimitedLaunchEvent=(typeof limitedLaunchEvents)[number]

export async function recordLimitedLaunchEvent(event:LimitedLaunchEvent){
  try{
    const {getSupabaseAdmin}=await import('@/lib/supabase')
    await getSupabaseAdmin().rpc('record_operational_event',{
      requested_event_key:`phase10h.${event}`,requested_count:1,
    })
  }catch{
    // Dormant controlled-beta aggregate telemetry stays non-blocking.
  }
}

export async function getLimitedLaunchAdminState(days = 14) {
  const { getSupabaseAdmin } = await import('@/lib/supabase')
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate()-Math.max(1,Math.min(days,90))+1)
  const date = (value:Date)=>value.toISOString().slice(0,10)
  const {data,error}=await getSupabaseAdmin().rpc('admin_get_limited_launch_funnel',{
    requested_start:date(start),requested_end:date(end),
  })
  if(error||!data) throw new Error('LIMITED_LAUNCH_FUNNEL_UNAVAILABLE')
  return data as {
    currentStages:Array<{stage_key:string;source_channel:string;count:number|null;masked:boolean}>
    dailyEntries:Array<{metric_date:string;stage_key:string;source_channel:string;count:number|null;masked:boolean}>
  }
}
