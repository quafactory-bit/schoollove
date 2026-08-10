import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260810160000_social_account_recovery_boundary.sql'), 'utf8')

describe('PHASE 10O-F social-account recovery migration contract', () => {
  it('is additive and creates the private registry, challenge, and cleanup boundary', () => {
    for (const table of ['private.private_accounts','private.social_identity_registry','private.recovery_email_verifications','private.auth_principal_cleanup_jobs']) {
      expect(sql).toContain(`CREATE TABLE ${table}`)
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
    }
    expect(sql).not.toMatch(/ALTER TABLE public\.(private_profiles|profile_school_memberships).*private_accounts/i)
  })

  it('keeps primary identity and verified recovery uniqueness immutable in the database', () => {
    expect(sql).toContain('PRIMARY_PROVIDER_IMMUTABLE')
    expect(sql).toContain('PRIMARY_BROKER_SUBJECT_IMMUTABLE')
    expect(sql).toContain('SOCIAL_IDENTITY_IMMUTABLE')
    expect(sql).toContain('private_accounts_verified_recovery_hmac_unique')
    expect(sql).toContain("WHERE recovery_email_verified_at IS NOT NULL AND status IN ('provisional','active','deletion_pending','cleanup_failed_safe')")
    expect(sql).toContain('social_identity_registry_one_active_identity')
  })

  it('stores only protected recovery material and a ten-minute, five-failure challenge', () => {
    expect(sql).toContain('recovery_email_hmac bytea')
    expect(sql).toContain('destination_ciphertext bytea NOT NULL')
    expect(sql).toContain('otp_mac bytea NOT NULL')
    expect(sql).toContain("failed_attempts BETWEEN 0 AND 5")
    expect(sql).toContain("expires_at <= created_at + interval '10 minutes'")
    expect(sql).not.toMatch(/raw_email|raw_otp|email text/i)
  })

  it('uses fixed-search-path SECURITY DEFINER RPCs and restricts mutation to service role', () => {
    for (const fn of ['create_provisional_social_account','bind_social_auth_principal','create_recovery_email_verification','consume_recovery_email_verification','activate_social_account','revoke_social_identity_for_deletion','enqueue_auth_principal_cleanup']) {
      expect(sql).toContain(`FUNCTION public.${fn}`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}`)
    }
    expect(sql).toContain("SECURITY DEFINER SET search_path='' AS $$")
    expect(sql).toContain('SOCIAL_SERVICE_ROLE_REQUIRED')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_social_account_state_for_owner() TO authenticated,service_role')
    expect(sql).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated')
  })

  it('keeps activation dark behind the existing open launch decision and adds no HTTP route', () => {
    expect(sql).toContain("launch.state<>'open'")
    expect(sql).toContain('SOCIAL_ACCOUNT_LAUNCH_CLOSED')
  })
})
