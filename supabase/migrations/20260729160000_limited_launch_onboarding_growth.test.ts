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

  it('masks small aggregates and closes dependent discovery writes', () => {
    expect(sql).toContain('CASE WHEN count(*)>=10 THEN count(*)::integer ELSE NULL END AS count')
    expect(sql).toContain('count(*)<10 AS masked')
    expect(sql).toContain("TG_TABLE_NAME='connection_requests' AND NOT public.has_beta_feature_access(actor,'people_search')")
  })

  it('does not consume an invite twice and selects the membership program first', () => {
    expect(sql).toContain("THEN RETURN 'ALREADY_REDEEMED'")
    expect(sql).toContain("CASE own_member.status WHEN 'active' THEN 0 WHEN 'pending_review' THEN 1 ELSE 2 END")
    const redeem=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.redeem_beta_invite'),sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_limited_launch_funnel'))
    expect(redeem).toContain('public.adult_eligibility_records')
    expect(redeem).toContain('public.consent_records')
    expect(redeem).not.toContain('has_current_adult_access')
  })
})
