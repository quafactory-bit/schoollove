import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260802120000_legacy_person_data_reset.sql'),
  'utf8',
)

describe('PHASE 10L legacy person reset migration', () => {
  it('is a one-shot guarded transaction that locks the complete contract', () => {
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/)
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("contract_count <> 68")
    expect(sql).toContain("delete_count <> 4")
    expect(sql).toContain("preserve_count <> 64")
    expect(sql).toContain("actual_count <> 68")
    expect(sql).toContain('PHASE10L_PUBLIC_TABLE_CLASSIFICATION_MISMATCH')
    expect(sql).toContain("ORDER BY table_name")
    expect(sql).toContain('IN SHARE ROW EXCLUSIVE MODE')
    expect(sql).not.toContain('empty_legacy')
  })

  it('classifies exactly four delete tables and all six previously omitted preserve tables', () => {
    for (const table of ['reports', 'search_logs', 'traces', 'profiles']) {
      expect(sql).toContain(`('${table}', 'delete')`)
      expect(sql).toContain(`DELETE FROM public.${table};`)
    }
    for (const table of [
      'safety_account_restrictions',
      'editorial_features',
      'operational_event_counters',
      'operational_incidents',
      'operational_job_runs',
      'retention_policy_versions',
    ]) {
      expect(sql).toContain(`('${table}', 'preserve')`)
    }
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.schools/i)
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.beta_/i)
    expect(sql).not.toMatch(/DELETE\s+FROM\s+auth\./i)
    expect(sql).not.toMatch(/TRUNCATE/i)
  })

  it('freezes the person-link catalog and fails closed on new person data', () => {
    expect(sql).toContain("('safety_account_restrictions', 'user_id')")
    expect(sql).toContain("('editorial_features', 'account_id')")
    expect(sql).toContain('PHASE10L_PERSON_LINK_COLUMN_CLASSIFICATION_MISMATCH')
    expect(sql).toContain("column_info.column_name ~ '(^|_)(user|profile|account|member|invite)_id$'")
    expect(sql).toContain('safety_restriction_count')
    expect(sql).toContain('PHASE10L_NEW_PERSON_DATA_PRESENT')
    expect(sql).toContain('PHASE10L_EDITORIAL_ACCOUNT_DATA_PRESENT')
    expect(sql).toContain('PHASE10L_BETA_OPERATION_DATA_PRESENT')
    expect(sql).toContain('PHASE10L_COMMERCIAL_DATA_PRESENT')
  })

  it('accepts only the exact audited baseline and preserves all 64 other tables', () => {
    expect(sql).toContain('PHASE10L_PRODUCTION_BASELINE_MISMATCH')
    expect(sql).toContain('profile_count <> 25')
    expect(sql).toContain('search_log_count <> 670')
    expect(sql).toContain('school_count <> 10006')
    expect(sql).toContain('beta_program_count <> 1')
    expect(sql).toContain('global_flag_count <> 8')
    expect(sql).toContain('phase10l_preserved_counts')
    expect(sql).toContain("WHERE disposition = 'preserve'")
    expect(sql).toContain('PHASE10L_PRESERVED_TABLE_CHANGED')
  })

  it('permanently removes raw-search and public legacy write grants', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.profiles, public\.reports, public\.traces, public\.search_logs\s+FROM PUBLIC, anon, authenticated;/)
    expect(sql).toContain('ON public.search_logs FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('REVOKE ALL ON TABLE public.search_logs FROM service_role;')
    expect(sql).toContain('PHASE10L_LEGACY_PUBLIC_INSERT_PRIVILEGE_REMAINS')
    expect(sql).toContain('PHASE10L_LEGACY_PUBLIC_INSERT_POLICY_REMAINS')
    expect(sql).toContain('PHASE10L_LEGACY_PUBLIC_WRITE_RPC_REMAINS')
    expect(sql).toContain('PHASE10L_SEARCH_LOG_SERVICE_ROLE_PRIVILEGE_REMAINS')
  })

  it('normalizes only affected school growth state and proves empty rankings', () => {
    expect(sql).toContain('CREATE TEMP TABLE phase10l_affected_schools')
    expect(sql).toContain('SET current_level = 1')
    expect(sql).toContain('level_updated_at = NULL')
    expect(sql).toContain('PHASE10L_SCHOOL_GROWTH_RESET_INCOMPLETE')
    expect(sql).toContain('PHASE10L_RANKING_NOT_EMPTY')
  })

  it('does not manipulate migration history or delete security objects', () => {
    expect(sql).not.toMatch(/schema_migrations|migration_history|supabase_migrations/i)
    expect(sql).not.toMatch(/DROP\s+TABLE|DROP\s+FUNCTION|DROP\s+TRIGGER/i)
    expect(sql).not.toMatch(/ALTER\s+TABLE/i)
  })
})
