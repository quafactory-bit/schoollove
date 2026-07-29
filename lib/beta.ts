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
  const [programs, members, flags, jobs, exports, events, incidents] = await Promise.all([
    admin.from('beta_programs').select('id,program_key,name,status,requires_admin_approval,starts_at,ends_at,emergency_disabled_at,updated_at').order('created_at'),
    admin.from('beta_members').select('id,program_id,status,enrolled_at,reviewed_at,reason_code').order('enrolled_at', { ascending: false }).limit(100),
    admin.from('beta_feature_flags').select('id,program_id,feature_key,enabled,reason_code,updated_at').is('user_id',null).order('feature_key'),
    admin.from('operational_job_runs').select('id,job_key,run_key,status,started_at,finished_at,result,safe_error_code').order('started_at', { ascending: false }).limit(30),
    admin.from('data_export_jobs').select('id,status,format,requested_at,ready_at,expires_at,safe_error_code').order('requested_at', { ascending: false }).limit(30),
    admin.from('operational_event_counters').select('metric_date,event_key,count').order('metric_date', { ascending: false }).limit(100),
    admin.from('operational_incidents').select('id,incident_key,severity,status,summary,opened_at,resolved_at').order('opened_at', { ascending: false }).limit(30),
  ])
  const error = [programs,members,flags,jobs,exports,events,incidents].find((result) => result.error)?.error
  if (error) throw new Error('OPERATIONS_STATE_UNAVAILABLE')
  const launch = await getLimitedLaunchAdminState()
  return { programs: programs.data, members: members.data, flags: flags.data, jobs: jobs.data, exports: exports.data, events: events.data, incidents: incidents.data, launch }
}
