import type { SupabaseClient } from '@supabase/supabase-js'
import { ACCOUNT_POLICY_VERSION, hasAllRequiredConsents } from '@/lib/policy/accountPolicy'

export type PrivateProfile = {
  id: string
  owner_user_id: string
  display_name: string
  instagram_handle: string | null
  profile_photo_url: string | null
  introduction: string | null
  profile_visibility: 'private'
  status: 'active' | 'hidden' | 'deletion_requested'
  created_at: string
  updated_at: string
}

export type SchoolMembership = {
  id: string
  school_id: string
  graduation_year: number
  class_number: number | null
  school: {
    id: string
    school_name: string
    sido: string
    sigungu: string
    slug: string
  } | null
}

export type AccountState = {
  adultEligible: boolean
  consentsComplete: boolean
  consentTypes: string[]
  profile: PrivateProfile | null
  memberships: SchoolMembership[]
  deletionRequested: boolean
}

export async function getAccountState(
  client: SupabaseClient,
  userId: string
): Promise<AccountState> {
  const [eligibilityResult, consentResult, profileResult, deletionResult] = await Promise.all([
    client
      .from('adult_eligibility_records')
      .select('id')
      .eq('user_id', userId)
      .eq('adult_eligible', true)
      .eq('policy_version', ACCOUNT_POLICY_VERSION)
      .order('adult_verified_at', { ascending: false })
      .limit(1),
    client
      .from('consent_records')
      .select('consent_type')
      .eq('user_id', userId)
      .eq('consented', true)
      .eq('policy_version', ACCOUNT_POLICY_VERSION),
    client
      .from('private_profiles')
      .select('id, owner_user_id, display_name, instagram_handle, profile_photo_url, introduction, profile_visibility, status, created_at, updated_at')
      .eq('owner_user_id', userId)
      .maybeSingle(),
    client
      .from('account_deletion_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(1),
  ])

  const profile = (profileResult.data as PrivateProfile | null) ?? null
  let memberships: SchoolMembership[] = []
  if (profile) {
    const membershipResult = await client
      .from('profile_school_memberships')
      .select('id, school_id, graduation_year, class_number, school:schools(id, school_name, sido, sigungu, slug)')
      .eq('owner_user_id', userId)
      .eq('profile_id', profile.id)
      .order('graduation_year', { ascending: false })
    memberships = (membershipResult.data ?? []) as unknown as SchoolMembership[]
  }

  const consentTypes = Array.from(new Set(
    (consentResult.data ?? [])
      .map((row: { consent_type?: unknown }) => row.consent_type)
      .filter((value): value is string => typeof value === 'string')
  ))

  return {
    adultEligible: (eligibilityResult.data?.length ?? 0) > 0,
    consentsComplete: hasAllRequiredConsents(consentTypes),
    consentTypes,
    profile,
    memberships,
    deletionRequested: (deletionResult.data?.length ?? 0) > 0,
  }
}

export async function hasCurrentAdultAccess(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('has_current_adult_access', {
    target_user_id: (await client.auth.getUser()).data.user?.id,
  })
  return !error && data === true
}
