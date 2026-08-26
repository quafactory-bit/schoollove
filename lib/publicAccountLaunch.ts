import type { SupabaseClient } from '@supabase/supabase-js'
import { createPublicAuthClient } from '@/lib/user-auth'

export type PublicAccountLaunchState =
  | 'closed'
  | 'internal_test'
  | 'ready'
  | 'open'
  | 'emergency_stopped'

export type PublicAccountFeature = 'account_registration' | 'private_profile' | 'school_membership'

export type PublicAccountLaunch = {
  state: PublicAccountLaunchState
  registrationEnabled: boolean
  privateProfileEnabled: boolean
  schoolMembershipEnabled: boolean
  emergencyStopped: boolean
}

export const CLOSED_PUBLIC_ACCOUNT_LAUNCH: PublicAccountLaunch = Object.freeze({
  state: 'closed',
  registrationEnabled: false,
  privateProfileEnabled: false,
  schoolMembershipEnabled: false,
  emergencyStopped: false,
})

type LaunchRow = {
  state?: unknown
  registration_enabled?: unknown
  private_profile_enabled?: unknown
  school_membership_enabled?: unknown
  emergency_stopped?: unknown
}

const launchStates = new Set<PublicAccountLaunchState>([
  'closed','internal_test','ready','open','emergency_stopped',
])

export function normalizePublicAccountLaunch(row: LaunchRow | null | undefined): PublicAccountLaunch {
  if (!row || typeof row.state !== 'string' || !launchStates.has(row.state as PublicAccountLaunchState)) {
    return CLOSED_PUBLIC_ACCOUNT_LAUNCH
  }
  const state = row.state as PublicAccountLaunchState
  const registrationEnabled = row.registration_enabled === true
  const privateProfileEnabled = row.private_profile_enabled === true
  const schoolMembershipEnabled = row.school_membership_enabled === true
  const emergencyStopped = row.emergency_stopped === true
  const valid = state === 'open'
    ? registrationEnabled && privateProfileEnabled && schoolMembershipEnabled && !emergencyStopped
    : state === 'internal_test'
      ? !registrationEnabled && privateProfileEnabled && schoolMembershipEnabled && !emergencyStopped
      : !registrationEnabled && !privateProfileEnabled && !schoolMembershipEnabled
        && emergencyStopped === (state === 'emergency_stopped')
  return valid ? { state,registrationEnabled,privateProfileEnabled,schoolMembershipEnabled,emergencyStopped }
    : CLOSED_PUBLIC_ACCOUNT_LAUNCH
}

export async function getPublicAccountLaunchState(client?: SupabaseClient): Promise<PublicAccountLaunch> {
  try {
    const supabase = client ?? createPublicAuthClient()
    const { data,error } = await supabase.rpc('get_public_account_launch_state')
    if (error) return CLOSED_PUBLIC_ACCOUNT_LAUNCH
    const row = Array.isArray(data) ? data[0] : data
    return normalizePublicAccountLaunch(row as LaunchRow | null)
  } catch {
    return CLOSED_PUBLIC_ACCOUNT_LAUNCH
  }
}

export async function hasPublicAccountFeatureAccess(
  client: SupabaseClient,
  feature: Exclude<PublicAccountFeature,'account_registration'>,
): Promise<boolean> {
  const { data,error } = await client.rpc('public_account_feature_enabled',{ requested_feature:feature })
  return !error && data === true
}

export async function hasPublicAccountAccessActive(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data,error } = await client.rpc('public_account_access_active',{
    target_user_id:userId,
  })
  return !error&&data===true
}

export async function hasPublicAccountWriteAccess(
  client: SupabaseClient,
  userId: string,
  feature: Exclude<PublicAccountFeature,'account_registration'>,
): Promise<boolean> {
  if(!await hasPublicAccountAccessActive(client,userId))return false
  if(await hasPublicAccountFeatureAccess(client,feature))return true
  const {data:betaAccess,error:betaError}=await client.rpc('has_beta_feature_access',{
    target_user_id:userId,requested_feature:'private_profile',
  })
  return !betaError&&betaAccess===true
}

export const PUBLIC_ACCOUNT_EVENTS = [
  'public_home_view','school_search_started','login_page_view','otp_request_accepted',
  'otp_verify_succeeded','adult_eligibility_completed','required_consents_completed',
  'private_profile_created','first_school_membership_created','onboarding_completed',
  'account_deletion_requested',
] as const
export type PublicAccountEvent = (typeof PUBLIC_ACCOUNT_EVENTS)[number]
export type PublicAccountActivity = 'public_home_view'|'school_search_started'|'login_page_view'|'otp_request_accepted'
export type PublicAccountSource = 'direct' | 'school_search' | 'account' | 'onboarding'

export async function recordPublicAccountActivity(
  event: PublicAccountActivity,
  source: Exclude<PublicAccountSource,'onboarding'> = 'direct',
): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    await getSupabaseAdmin().rpc('record_public_account_activity',{
      requested_event:event,
      requested_source:source,
    })
  } catch {
    // Aggregate measurement is deliberately non-blocking for the account flow.
  }
}

export async function getPublicAccountAdminState() {
  const { getSupabaseAdmin } = await import('@/lib/supabase')
  const admin = getSupabaseAdmin()
  const [control,funnel,deletions,audit] = await Promise.all([
    admin.from('public_account_launch_control')
      .select('state,account_registration_enabled,private_profile_enabled,school_membership_enabled,emergency_stopped_at,last_reason_code,updated_at')
      .eq('control_key','public_account').single(),
    admin.rpc('get_public_account_funnel'),
    admin.from('account_deletion_requests')
      .select('id,status,created_at,resolved_at').in('status',['pending','public_data_deleted','auth_deletion_pending','failed_safe'])
      .order('created_at',{ascending:true}).limit(100),
    admin.from('public_account_launch_audit')
      .select('id,action,from_state,to_state,reason_code,created_at')
      .order('created_at',{ascending:false}).limit(30),
  ])
  const failed = [control,funnel,deletions,audit].find((result)=>result.error)
  if (failed?.error) throw new Error('PUBLIC_ACCOUNT_ADMIN_STATE_UNAVAILABLE')
  return { control:control.data,funnel:funnel.data??[],deletions:deletions.data??[],audit:audit.data??[] }
}

const safeMembershipErrors: Record<string,string> = {
  INVALID_SCHOOL_MEMBERSHIP:'학교 이력 입력값을 확인해 주세요.',
  SCHOOL_MEMBERSHIP_CLOSED:'학교 이력 저장은 아직 준비 중입니다.',
  PUBLIC_ACCOUNT_SCHOOL_MEMBERSHIP_CLOSED:'학교 이력 저장은 아직 준비 중입니다.',
  PUBLIC_ACCOUNT_SCHOOL_LIMIT_REACHED:'학교 이력은 최대 3개까지 저장할 수 있습니다.',
  PUBLIC_ACCOUNT_SCHOOL_DUPLICATE:'이미 저장한 학교와 졸업연도입니다.',
  FUTURE_GRADUATION_YEAR_NOT_ALLOWED:'미래 졸업연도는 저장할 수 없습니다.',
  PRIVATE_PROFILE_REQUIRED:'비공개 프로필을 먼저 저장해 주세요.',
  ADULT_CONSENT_REQUIRED:'성인 확인과 필수 동의가 필요합니다.',
  ACCOUNT_DELETION_REQUESTED:'탈퇴 처리 중에는 정보를 변경할 수 없습니다.',
  SCHOOL_OUTSIDE_BETA_SCOPE:'제한 베타에서 승인된 학교만 저장할 수 있습니다.',
  SECOND_SCHOOL_NOT_ALLOWED:'제한 베타 계정은 승인된 학교 한 곳만 저장할 수 있습니다.',
  ACTIVE_CONTROLLED_BETA_MEMBERSHIP_REQUIRED:'제한 베타 학교 계약을 확인할 수 없습니다.',
}

export function getSafeMembershipError(error: { message?: string } | null): string | null {
  const code = error?.message?.match(/\b[A-Z][A-Z0-9_]{1,59}\b/)?.[0]
  return code ? safeMembershipErrors[code] ?? null : null
}
