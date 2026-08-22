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

  it('delegates legacy paths before candidate row locks and handles post-lock activation directly', () => {
    const wrapperStart = sql.indexOf('CREATE FUNCTION public.record_verified_social_identity_from_upstream_leg(')
    const wrapperEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.issue_transaction_bound_broker_authorization_code(', wrapperStart)
    const wrapper = sql.slice(wrapperStart, wrapperEnd)
    const accountLock = wrapper.indexOf('SELECT * INTO account FROM private.private_accounts WHERE id=candidate_account_id FOR UPDATE')
    const identityLock = wrapper.indexOf('SELECT * INTO identity FROM private.social_identity_registry WHERE broker_subject=requested_broker_subject FOR UPDATE')
    const helperCalls = [...wrapper.matchAll(/RETURN private\.record_verified_identity_before_bound_reauth\(/g)].map(match => match.index!)

    expect(accountLock).toBeGreaterThan(0)
    expect(identityLock).toBeGreaterThan(accountLock)
    expect(helperCalls.length).toBeGreaterThan(0)
    expect(Math.max(...helperCalls)).toBeLessThan(accountLock)
    expect(wrapper.indexOf("account.status='active'", identityLock)).toBeGreaterThan(identityLock)
    expect(wrapper.indexOf("SET state='existing_primary'", identityLock)).toBeGreaterThan(identityLock)
    expect(wrapper.indexOf("RETURN 'EXISTING_PRIMARY'", identityLock)).toBeGreaterThan(identityLock)
    expect(wrapper.indexOf("RETURN 'IDENTITY_DECISION_IN_PROGRESS'", identityLock)).toBeGreaterThan(identityLock)
  })

  it('accepts only exact provisional-bound or active-bound auth_principal_bound issuance shapes', () => {
    for (const functionName of [
      'public.issue_transaction_bound_broker_authorization_code(',
      'public.get_transaction_bound_broker_code_issuance_context(',
    ]) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${functionName}`)
      expect(start).toBeGreaterThan(0)
      const body = sql.slice(start, sql.indexOf('END $$;', start) + 7)
      expect(body).toContain("attempt.state='auth_principal_bound'")
      expect(body).toContain("a.status='provisional' AND a.auth_user_id IS NOT NULL AND r.status='provisional' AND r.auth_user_id=a.auth_user_id AND r.activated_at IS NULL")
      expect(body).toContain("a.status='active' AND a.auth_user_id IS NOT NULL AND a.activated_at IS NOT NULL AND r.status='active' AND r.auth_user_id=a.auth_user_id AND r.activated_at IS NOT NULL")
      expect(body).toContain("attempt.state='account_decided' AND a.status='provisional' AND a.auth_user_id IS NULL AND r.status='provisional' AND r.auth_user_id IS NULL")
      expect(body).toContain("attempt.state='existing_primary' AND a.status='active'")
      expect(body).not.toContain("attempt.state='account_decided' AND a.status='active'")
    }
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
