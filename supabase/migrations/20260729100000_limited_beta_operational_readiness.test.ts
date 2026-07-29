import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./20260729100000_limited_beta_operational_readiness.sql', import.meta.url),'utf8')
const tables = ['beta_programs','beta_invites','beta_members','beta_feature_flags','beta_audit_logs','operational_job_runs','data_export_jobs','retention_policy_versions','operational_event_counters','operational_incidents']

describe('PHASE 10F limited beta operational readiness migration', () => {
  it('creates ten private operational tables with forced RLS', () => {
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE public.${table}`)
      expect(sql).toContain(`'${table}'`)
    }
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE')
  })

  it('defaults every beta feature closed and requires an active reviewed membership', () => {
    expect(sql).toContain("'LIMITED_BETA_DEFAULT_ENABLED'")
    expect(sql).toContain("m.status='active'")
    expect(sql).toContain("auth.uid()=target_user_id")
    expect(sql).toContain("p.status='active'")
    expect(sql).toContain('p.emergency_disabled_at IS NULL')
    expect(sql).toContain("r.status='suspended'")
  })

  it('stores only hashes for invite identity constraints', () => {
    expect(sql).toContain('token_hash text NOT NULL UNIQUE')
    expect(sql).toContain('email_hash text')
    expect(sql).toContain('domain_hash text')
    expect(sql).not.toMatch(/CREATE TABLE public\.beta_invites[\s\S]*?(?:raw_email|email_address|invite_token text)/)
  })

  it('enforces past graduation years in the database', () => {
    expect(sql).toContain('enforce_past_graduation_year')
    expect(sql).toContain("AT TIME ZONE 'Asia/Seoul'")
    expect(sql).toContain('FUTURE_GRADUATION_YEAR_NOT_ALLOWED')
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF graduation_year')
  })

  it('makes maintenance idempotent, locked, configurable, and aggregate-only', () => {
    expect(sql).toContain('run_key text NOT NULL UNIQUE')
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock")
    expect(sql).toContain("policy_key='phase10f' AND status='active'")
    expect(sql).toContain("jsonb_build_object('idempotent',true)")
    expect(sql).toContain("'system','phase10f_maintenance','scheduled_start'")
    expect(sql).toContain("'system','phase10f_maintenance','scheduled_end'")
    expect(sql).toContain("'ok',false,'error','MAINTENANCE_FAILED'")
    expect(sql).toContain('promotion_performance_reports')
    expect(sql).not.toMatch(/nickname|instagram_handle|message\s+text|search_query/i)
  })

  it('keeps privileged mutations away from public roles', () => {
    expect(sql).toContain('FROM PUBLIC,anon,authenticated')
    expect(sql).toContain('TO service_role')
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE[^;]+ TO authenticated/)
  })
})
