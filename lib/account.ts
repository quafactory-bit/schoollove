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
  class_history: Array<{
    grade_number: number
    class_number: number
  }>
  school: {
    id: string
    school_name: string
    school_type: string
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
  deletionStatus: 'pending' | 'public_data_deleted' | 'auth_deletion_pending' | 'failed_safe' | 'done' | null
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
      .select('id,status')
      .eq('user_id', userId)
      .in('status', ['pending','public_data_deleted','auth_deletion_pending','failed_safe','done'])
      .order('created_at',{ascending:false})
      .limit(1),
  ])
  if (eligibilityResult.error || consentResult.error || profileResult.error || deletionResult.error) {
    throw new Error('ACCOUNT_STATE_UNAVAILABLE')
  }

  const profile = (profileResult.data as PrivateProfile | null) ?? null
  let memberships: SchoolMembership[] = []
  if (profile) {
    const membershipResult = await client
      .from('profile_school_memberships')
      .select('id, school_id, graduation_year, class_number, class_history:profile_school_class_histories(grade_number, class_number), school:schools(id, school_name, school_type, sido, sigungu, slug)')
      .eq('owner_user_id', userId)
      .eq('profile_id', profile.id)
      .order('graduation_year', { ascending: false })
    if (membershipResult.error) throw new Error('ACCOUNT_STATE_UNAVAILABLE')
    memberships = ((membershipResult.data ?? []) as unknown as SchoolMembership[]).map((membership) => ({
      ...membership,
      class_history: [...(membership.class_history ?? [])]
        .sort((left, right) => left.grade_number - right.grade_number),
    }))
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
    deletionRequested: ['pending','public_data_deleted','auth_deletion_pending','failed_safe'].includes(deletionResult.data?.[0]?.status??''),
    deletionStatus: ['pending','public_data_deleted','auth_deletion_pending','failed_safe','done'].includes(deletionResult.data?.[0]?.status??'')
      ? deletionResult.data[0].status as AccountState['deletionStatus'] : null,
  }
}

export async function hasCurrentAdultAccess(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('has_current_adult_access', {
    target_user_id: (await client.auth.getUser()).data.user?.id,
  })
  return !error && data === true
}
