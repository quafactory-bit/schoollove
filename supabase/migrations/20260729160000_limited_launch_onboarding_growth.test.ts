import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(),'supabase/migrations/20260729160000_limited_launch_onboarding_growth.sql'),'utf8')

describe('PHASE 10H limited launch migration', () => {
  it('stores only coarse source and stage values behind RLS', () => {
    expect(sql).toContain('CREATE TABLE public.beta_onboarding_progress')
    expect(sql).toContain('CREATE TABLE public.beta_growth_daily_metrics')
    expect(sql.match(/FORCE ROW LEVEL SECURITY/g)?.length).toBe(3)
    expect(sql).not.toMatch(/\b(email|instagram_handle|search_query|ip_address|referrer|utm_[a-z_]*)\s+(text|varchar)/i)
  })

  it('keeps owner sync scoped and privileged operations service-only', () => {
    expect(sql).toContain("auth.uid()=actor_user_id OR auth.role()='service_role' OR session_user='postgres'")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.sync_own_beta_onboarding_state(uuid,text) TO authenticated,service_role')
    expect(sql).not.toContain('GRANT EXECUTE ON FUNCTION public.admin_get_limited_launch_funnel(date,date) TO authenticated')
  })

  it('deduplicates each onboarding stage before incrementing aggregates', () => {
    expect(sql).toContain('UNIQUE(progress_id,stage_key)')
    expect(sql).toContain('ON CONFLICT(progress_id,stage_key) DO NOTHING')
    expect(sql).toContain('IF event_inserted=1 THEN')
  })
})
