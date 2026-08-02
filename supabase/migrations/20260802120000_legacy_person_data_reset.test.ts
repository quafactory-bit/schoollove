import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260802120000_legacy_person_data_reset.sql'),
  'utf8',
)

describe('PHASE 10L legacy person reset migration', () => {
  it('is one guarded transaction with an empty fresh-database path', () => {
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/)
    expect(sql).toContain('IN SHARE ROW EXCLUSIVE MODE')
    expect(sql).toContain('empty_legacy := profile_count = 0')
    expect(sql).toContain('PHASE10L_PRODUCTION_BASELINE_MISMATCH')
    expect(sql).toContain('profile_count <> 25')
    expect(sql).toContain('search_log_count <> 670')
    expect(sql).toContain('school_count <> 10006')
  })

  it('deletes only the audited legacy person and raw-search tables', () => {
    for (const table of ['reports', 'traces', 'search_logs', 'profiles']) {
      expect(sql).toContain(`DELETE FROM public.${table};`)
    }
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.schools/i)
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.beta_/i)
    expect(sql).not.toMatch(/DELETE\s+FROM\s+auth\./i)
    expect(sql).not.toMatch(/TRUNCATE/i)
  })

  it('fails closed around new private, beta, and commercial data', () => {
    expect(sql).toContain('PHASE10L_NEW_PERSON_DATA_PRESENT')
    expect(sql).toContain('PHASE10L_BETA_OPERATION_DATA_PRESENT')
    expect(sql).toContain('PHASE10L_COMMERCIAL_DATA_PRESENT')
    expect(sql).toContain('scoped_flag_count <> 0')
    expect(sql).toContain('phase10l_preserved_counts')
    expect(sql).toContain('PHASE10L_PRESERVED_TABLE_CHANGED')
  })

  it('normalizes only affected school growth state and proves empty rankings', () => {
    expect(sql).toContain('CREATE TEMP TABLE phase10l_affected_schools')
    expect(sql).toContain('SET current_level = 1')
    expect(sql).toContain('level_updated_at = NULL')
    expect(sql).toContain('PHASE10L_SCHOOL_GROWTH_RESET_INCOMPLETE')
    expect(sql).toContain('PHASE10L_RANKING_NOT_EMPTY')
  })

  it('does not alter schema security or migration history', () => {
    expect(sql).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY|GRANT\s|REVOKE\s/i)
    expect(sql).not.toMatch(/schema_migrations|migration_history|supabase_migrations/i)
    expect(sql).not.toMatch(/ALTER\s+TABLE/i)
  })
})
