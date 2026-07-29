import { getSupabaseAdmin } from '@/lib/supabase'
import { createBetaInviteToken, hashBetaIdentity } from '@/lib/beta'
import type { z } from 'zod'
import type { BetaAdminOperationSchema } from '@/lib/policy/operations'

type Operation = z.infer<typeof BetaAdminOperationSchema>

export async function applyBetaAdminOperation(operation: Operation, actor = 'admin:session') {
  const admin = getSupabaseAdmin()
  if (operation.action === 'issue_invite') {
    const token = createBetaInviteToken()
    const { data, error } = await admin.rpc('admin_issue_beta_invite', {
      target_program_id: operation.programId,
      requested_token_hash: hashBetaIdentity(token),
      requested_email_hash: operation.email ? hashBetaIdentity(operation.email) : null,
      requested_domain_hash: operation.domain ? hashBetaIdentity(operation.domain) : null,
      requested_max_uses: operation.maxUses,
      requested_expires_at: operation.expiresAt,
      admin_actor: actor,
    })
    if (error) throw new Error('INVITE_ISSUE_FAILED')
    return { id: data as string, token }
  }
  if (operation.action === 'review_member') {
    const { error } = await admin.rpc('admin_review_beta_member', { target_member_id: operation.memberId, requested_status: operation.status, requested_reason: operation.reason, admin_actor: actor })
    if (error) throw new Error('MEMBER_REVIEW_FAILED')
    return { applied: true }
  }
  if (operation.action === 'set_feature') {
    const { error } = await admin.rpc('admin_set_beta_feature', { target_program_id: operation.programId, target_user_id: operation.userId, requested_feature: operation.feature, requested_enabled: operation.enabled, requested_reason: operation.reason, admin_actor: actor })
    if (error) throw new Error('FEATURE_UPDATE_FAILED')
    return { applied: true }
  }
  const { error } = await admin.rpc('admin_set_beta_emergency', { target_program_id: operation.programId, requested_disabled: operation.disabled, requested_reason: operation.reason, admin_actor: actor })
  if (error) throw new Error('EMERGENCY_UPDATE_FAILED')
  return { applied: true }
}

export async function runMaintenance(runKey: string, asOf = new Date().toISOString()) {
  const { data, error } = await getSupabaseAdmin().rpc('run_phase10f_maintenance', { requested_run_key: runKey, requested_as_of: asOf })
  if (error || !data || (typeof data === 'object' && 'ok' in data && data.ok === false)) throw new Error('MAINTENANCE_FAILED')
  return data
}
