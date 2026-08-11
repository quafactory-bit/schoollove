import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260810182000_social_login_attempt_decision_boundary.sql'), 'utf8')
const decisionContract = readFileSync(resolve(process.cwd(), 'lib/auth/social-broker/decision.ts'), 'utf8')

describe('PHASE 10O-G attempt-first migration contract', () => {
  it('adds only a forward private attempt table and never changes applied 10O-F', () => {
    expect(sql).toContain('CREATE TABLE private.oauth_login_attempts')
    expect(sql).toContain('ALTER TABLE private.oauth_login_attempts ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE private.oauth_login_attempts FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('PHASE10O_G_BASELINE_MISSING')
    expect(sql).not.toMatch(/raw_upstream_subject|provider_email|access_token|refresh_token|authorization_code|callback_query|nickname|birthday|gender/i)
  })

  it('requires recovery before account decision and retires direct creation', () => {
    expect(sql).toContain('consume_recovery_and_decide_social_account')
    expect(sql).toContain("'USE_PRIMARY_PROVIDER'")
    expect(sql).toContain("'ACCOUNT_DECIDED'")
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.create_provisional_social_account')
    expect(sql).toContain('SOCIAL_PRINCIPAL_BINDING_RECOVERY_DECISION_REQUIRED')
    expect(sql).toContain("'existing_primary') OR account_id IS NOT NULL")
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock')
  })

  it('claims a broker subject under its broker lock before recovery and returns a coarse loser outcome', () => {
    const recordStart = sql.indexOf('CREATE FUNCTION public.record_verified_social_identity')
    const recordEnd = sql.indexOf('CREATE FUNCTION public.create_login_attempt_recovery_verification')
    const recordSql = sql.slice(recordStart, recordEnd)
    expect(recordSql).toContain("'schoollove:10o-g:broker-decision:v1:'")
    expect(recordSql.indexOf('pg_catalog.pg_advisory_xact_lock')).toBeLessThan(recordSql.indexOf("SET state='upstream_verified'"))
    expect(recordSql).toContain('state IN (\'upstream_verified\',\'recovery_required\',\'recovery_pending\',\'recovery_verified\')')
    expect(recordSql).toContain("RETURN 'IDENTITY_DECISION_IN_PROGRESS'")
    expect(recordSql).toContain("violation_constraint<>'oauth_login_attempts_live_subject_unique'")
    expect(sql).toContain("WHERE state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')")
    const decisionStart = sql.indexOf('CREATE FUNCTION public.consume_recovery_and_decide_social_account')
    const decisionEnd = sql.indexOf('-- Retire the direct pre-recovery')
    const decisionSql = sql.slice(decisionStart, decisionEnd)
    expect(decisionSql.indexOf('schoollove:10o-g:recovery-decision:v1')).toBeLessThan(decisionSql.indexOf('schoollove:10o-g:broker-decision:v1'))
  })

  it('keeps recovery challenge attempt-bound, single-pending, and secret-clearing', () => {
    expect(sql).toContain('login_attempt_id uuid NULL REFERENCES private.oauth_login_attempts')
    expect(sql).toContain('recovery_email_verifications_owner_binding')
    expect(sql).toContain("'login_decision'")
    expect(sql).toContain('recovery_email_verifications_one_pending_per_owner_purpose')
    expect(sql).toContain('recovery_failed_attempts=recovery_failed_attempts+1')
    expect(sql).toContain("'upstream_verified','recovery_required','recovery_pending'")
    expect(sql).toContain('recovery_failed_attempts smallint NOT NULL DEFAULT 0')
    expect(sql).toContain('attempt.recovery_failed_attempts>=5')
    expect(sql).toContain("status='revoked',revoked_at=issued_at")
    expect(sql).toContain("state='recovery_pending'")
  })

  it('uses an explicit state matrix: atomic identity, required active identity, and optional terminal identity', () => {
    expect(sql).toContain("CHECK ((broker_subject IS NULL)=(subject_digest IS NULL) AND (broker_subject IS NULL)=(subject_key_version IS NULL))")
    expect(sql).toContain("split_part(broker_subject,':',4)=provider")
    expect(sql).toContain("split_part(broker_subject,':',3)='k'||lpad(subject_key_version::text,2,'0')")
    expect(sql).toContain("state<>'created' OR broker_subject IS NULL")
    expect(sql).toContain("'upstream_verified','recovery_required','recovery_pending','recovery_verified','account_decided','existing_primary','existing_account_match','auth_principal_bound','broker_code_ready','consumed'")
    expect(sql).toContain("'cancelled','expired','provider_mismatch','replay_rejected','launch_blocked','failed_safe'")
    expect(sql).toContain("state NOT IN ('account_decided','auth_principal_bound','broker_code_ready','consumed','existing_primary') OR account_id IS NOT NULL")
    expect(sql).toContain('CHECK (account_id IS NULL OR broker_subject IS NOT NULL)')
  })

  it('allows service RPCs only and exposes no public route', () => {
    for (const fn of ['create_social_login_attempt','record_verified_social_identity','create_login_attempt_recovery_verification','consume_recovery_and_decide_social_account']) {
      expect(sql).toContain(`FUNCTION public.${fn}`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}`)
    }
    expect(sql).toContain("SECURITY DEFINER SET search_path='' AS $$")
    expect(sql).toContain('SOCIAL_ATTEMPT_SERVICE_ROLE_REQUIRED')
  })

  it('keeps SQL RPC outcomes exactly aligned with the TypeScript orchestration contract', () => {
    const recordStart = sql.indexOf('CREATE FUNCTION public.record_verified_social_identity')
    const recordEnd = sql.indexOf('CREATE FUNCTION public.create_login_attempt_recovery_verification')
    const recordSql = sql.slice(recordStart, recordEnd)
    const decisionStart = sql.indexOf('CREATE FUNCTION public.consume_recovery_and_decide_social_account')
    const decisionEnd = sql.indexOf('-- Retire the direct pre-recovery')
    const decisionSql = sql.slice(decisionStart, decisionEnd)

    const recordOutcomes = ['RECOVERY_REQUIRED', 'EXISTING_PRIMARY', 'IDENTITY_DECISION_IN_PROGRESS']
    const decisionOutcomes = ['ACCOUNT_DECIDED', 'USE_PRIMARY_PROVIDER', 'EXISTING_PRIMARY', 'ACCOUNT_DECISION_IN_PROGRESS', 'IDENTITY_DECISION_IN_PROGRESS', 'ACCOUNT_UNAVAILABLE', 'EXPIRED', 'OTP_REJECTED', 'LOCKED']
    const returned = (source: string, allowed: string[]) => [...new Set(
      [...source.matchAll(/'([A-Z_]+)'/g)].map(([, value]) => value).filter(value => allowed.includes(value)),
    )].sort()
    const typeStart = decisionContract.indexOf('export type SocialLoginAttemptStore')
    const typeEnd = decisionContract.indexOf('export type SocialAccountDecisionService')
    const typeSql = decisionContract.slice(typeStart, typeEnd)

    expect(returned(recordSql, recordOutcomes)).toEqual([...recordOutcomes].sort())
    expect(returned(typeSql, recordOutcomes)).toEqual([...recordOutcomes].sort())
    expect(returned(decisionSql, decisionOutcomes)).toEqual([...decisionOutcomes].sort())
    expect(returned(typeSql, decisionOutcomes)).toEqual([...decisionOutcomes].sort())
    expect(decisionContract).toContain("primaryProvider: SocialProvider")
    expect(decisionContract).toContain("primaryProvider: null")
  })
})
