import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingSource } from '@/lib/policy/onboarding'

export type OnboardingStage =
  | 'adult_required' | 'consent_required' | 'invite_required' | 'approval_pending'
  | 'access_paused' | 'profile_required' | 'school_required' | 'ready'

export type OnboardingState = {
  stage: OnboardingStage
  programAvailable: boolean
  adultReady: boolean
  consentsReady: boolean
  memberStatus: string | null
  profileReady: boolean
  schoolReady: boolean
  discoveryReady: boolean
  source?: OnboardingSource
}

export async function syncOnboardingProgress(
  client: SupabaseClient,
  userId: string,
  source: OnboardingSource = 'unknown'
): Promise<OnboardingState | null> {
  const { data, error } = await client.rpc('sync_own_beta_onboarding_state', {
    actor_user_id: userId,
    requested_source: source,
  })
  return error || !data ? null : data as OnboardingState
}

export async function syncOnboardingProgressSafely(
  client: SupabaseClient,
  userId: string,
  source: OnboardingSource = 'unknown'
) {
  try { return await syncOnboardingProgress(client,userId,source) } catch { return null }
}

export const limitedLaunchEvents = [
  'invite_redeemed', 'private_profile_saved', 'school_membership_saved',
  'people_search_completed', 'connection_request_created',
] as const
export type LimitedLaunchEvent = typeof limitedLaunchEvents[number]

export async function recordLimitedLaunchEvent(event: LimitedLaunchEvent) {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    await getSupabaseAdmin().rpc('record_operational_event', {
      requested_event_key: `phase10h.${event}`,
      requested_count: 1,
    })
  } catch {
    // Aggregate growth telemetry must never make the user's primary request fail.
  }
}

export async function getLimitedLaunchAdminState(days = 14) {
  const { getSupabaseAdmin } = await import('@/lib/supabase')
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate()-Math.max(1,Math.min(days,90))+1)
  const date = (value: Date) => value.toISOString().slice(0,10)
  const { data, error } = await getSupabaseAdmin().rpc('admin_get_limited_launch_funnel', {
    requested_start: date(start),
    requested_end: date(end),
  })
  if (error || !data) throw new Error('LIMITED_LAUNCH_FUNNEL_UNAVAILABLE')
  return data as { currentStages: Array<{ stage_key:string; source_channel:string; count:number }>; dailyEntries: Array<{ metric_date:string; stage_key:string; source_channel:string; count:number }> }
}
