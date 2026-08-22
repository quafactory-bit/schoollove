import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./20260822022953_social_activation_gate_and_bound_provisional_reauth.sql', import.meta.url), 'utf8')

describe('PHASE 10P social activation and bound provisional reauth migration', () => {
  it('repairs only a missing singleton to closed and preserves a valid singleton', () => {
    expect(sql).toContain('IF row_count > 1 THEN')
    expect(sql).toContain("'MISSING_SINGLETON_RESTORED_CLOSED','phase10p_migration'")
    expect(sql).toContain("'public_account','closed',false,false,false,NULL")
    expect(sql).toContain("RAISE EXCEPTION 'PHASE10P_LAUNCH_SINGLETON_MALFORMED'")
    expect(sql).not.toMatch(/UPDATE\s+public\.public_account_launch_control/i)
  })

  it('makes launch authorization NULL-safe and exact-open only', () => {
    expect(sql).toContain("launch.state IS DISTINCT FROM 'open'")
    expect(sql).toContain('launch.account_registration_enabled IS DISTINCT FROM true')
    expect(sql).toContain('launch.private_profile_enabled IS DISTINCT FROM true')
    expect(sql).toContain('launch.school_membership_enabled IS DISTINCT FROM true')
    expect(sql).toContain('launch.emergency_stopped_at IS NOT NULL')
    expect(sql).toContain("IF launch_count<>1 THEN RAISE EXCEPTION 'SOCIAL_ACCOUNT_LAUNCH_CLOSED'")
  })

  it('derives activation from a consumed attempt and exact Supabase identity', () => {
    expect(sql).toContain('CREATE FUNCTION public.activate_social_account_from_attempt(target_attempt_id uuid)')
    expect(sql).toContain("attempt.state<>'consumed'")
    expect(sql).toContain("i.provider='custom:schoollove-'||attempt.provider")
    expect(sql).toContain("i.provider_id=attempt.broker_subject")
    expect(sql).toContain("i.identity_data->>'sub'=attempt.broker_subject")
    expect(sql).toContain("RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'")
  })

  it('recognizes only the exact bound provisional tuple and reuses auth_principal_bound', () => {
    expect(sql).toContain("account.status='provisional' AND account.auth_user_id IS NOT NULL")
    expect(sql).toContain("identity.status='provisional'")
    expect(sql).toContain('identity.subject_digest=requested_subject_digest')
    expect(sql).toContain("SET state='auth_principal_bound'")
    expect(sql).toContain("RETURN 'BOUND_PROVISIONAL_REAUTH_READY'")
  })

  it('keeps all public mutation RPCs service-role only and the legacy helper private', () => {
    for (const signature of [
      'public.activate_social_account(uuid)',
      'public.activate_social_account_from_attempt(uuid)',
      'public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,anon,authenticated`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`)
    }
    expect(sql).toContain('REVOKE ALL ON FUNCTION private.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)')
    expect(sql).toContain('FROM PUBLIC,anon,authenticated,service_role')
  })
})
