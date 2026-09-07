import type { SupabaseClient } from '@supabase/supabase-js'
import { hasAccountOnboardingWriteAccess } from '@/lib/publicAccountLaunch'
import { hasBetaFeatureAccess } from '@/lib/beta'

// Coarse route pre-gate only. The owner RPC enforces exact program/school authority.
export async function hasClassHistorySelfServiceWriteAccess(client: SupabaseClient, userId: string): Promise<boolean> {
  if (await hasAccountOnboardingWriteAccess(client, userId, 'school_membership', 'school_membership')) return true
  return hasBetaFeatureAccess(client, userId, 'people_search')
}
