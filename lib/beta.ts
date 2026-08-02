import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BetaFeatureKey } from '@/lib/policy/operations'
import { getLimitedLaunchAdminState } from '@/lib/onboarding'

export function hashBetaIdentity(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

export function createBetaInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function hasBetaFeatureAccess(client: SupabaseClient, userId: string, feature: BetaFeatureKey): Promise<boolean> {
  const { data, error } = await client.rpc('has_beta_feature_access', { target_user_id: userId, requested_feature: feature })
  return !error && data === true
}

export async function getBetaAdminState() {
  const { getSupabaseAdmin } = await import('@/lib/supabase')
  const admin = getSupabaseAdmin()
  const [programs, members, flags, snapshots, programSchools, jobs, exports, events, incidents] = await Promise.all([
    admin.from('beta_programs').select('id,program_key,name,status,requires_admin_approval,starts_at,ends_at,emergency_disabled_at,updated_at').order('created_at'),
    admin.from('beta_members').select('id,program_id,status,enrolled_at,reviewed_at,reason_code').order('enrolled_at', { ascending: false }).limit(100),
    admin.from('beta_feature_flags').select('id,program_id,feature_key,enabled,reason_code,updated_at').is('user_id',null).order('feature_key'),
    admin.from('beta_program_setup_snapshots').select('id,program_id,max_users,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions'),
    admin.from('beta_program_schools').select('program_id,school_id,school:schools(id,school_name,school_type,sido,sigungu)'),
    admin.from('operational_job_runs').select('id,job_key,run_key,status,started_at,finished_at,result,safe_error_code').order('started_at', { ascending: false }).limit(30),
    admin.from('data_export_jobs').select('id,status,format,requested_at,ready_at,expires_at,safe_error_code').order('requested_at', { ascending: false }).limit(30),
    admin.from('operational_event_counters').select('metric_date,event_key,count').order('metric_date', { ascending: false }).limit(100),
    admin.from('operational_incidents').select('id,incident_key,severity,status,summary,opened_at,resolved_at').order('opened_at', { ascending: false }).limit(30),
  ])
  const error = [programs,members,flags,snapshots,programSchools,jobs,exports,events,incidents].find((result) => result.error)?.error
  if (error) throw new Error('OPERATIONS_STATE_UNAVAILABLE')
  const launch = await getLimitedLaunchAdminState()
  const safePrograms=(programs.data??[]).map((program)=>{
    const snapshot=(snapshots.data??[]).find((item)=>item.program_id===program.id)
    const allowed=(programSchools.data??[]).filter((item)=>item.program_id===program.id)
    const school=allowed[0]?.school
    const programFlags=(flags.data??[]).filter((item)=>item.program_id===program.id)
    const enabled=programFlags.filter((item)=>item.enabled).map((item)=>item.feature_key).sort()
    const featureContract=programFlags.length===8&&enabled.length===2&&enabled[0]==='account_registration'&&enabled[1]==='private_profile'
    const globalFeatureStopped=(flags.data??[]).some((item)=>item.program_id===null&&!item.enabled&&['account_registration','private_profile'].includes(item.feature_key))
    const startsAt=program.starts_at?new Date(program.starts_at).getTime():NaN
    const endsAt=program.ends_at?new Date(program.ends_at).getTime():NaN
    const timeEligible=Number.isFinite(startsAt)&&Number.isFinite(endsAt)&&Date.now()>=startsAt&&Date.now()<endsAt
    const inviteContract=snapshot?.invite_policy?.maxUsesPerInvite===1&&snapshot?.invite_policy?.expiresInDays===7&&snapshot?.approval_waitlist_enabled===true
    return {...program,snapshot_backed:Boolean(snapshot),selected_school:Array.isArray(school)?school[0]??null:school??null,school_allowlist_count:allowed.length,invite_eligible:Boolean(snapshot)&&allowed.length===1&&snapshot?.target_school_id===allowed[0]?.school_id&&featureContract&&!globalFeatureStopped&&inviteContract&&timeEligible&&program.status==='active'&&!program.emergency_disabled_at}
  })
  return { programs:safePrograms, members: members.data, flags: flags.data, jobs: jobs.data, exports: exports.data, events: events.data, incidents: incidents.data, launch }
}
