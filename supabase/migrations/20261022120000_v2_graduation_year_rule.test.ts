import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20261022120000_v2_graduation_year_rule.sql', 'utf8')

describe('v2-02 graduation year rule migration', () => {
  it('uses the same per-type upper bounds as lib/policy/adultEligibility.ts', () => {
    expect(sql).toContain("now() AT TIME ZONE 'Asia/Seoul'")
    expect(sql).toContain('requested_graduation_year >= 1950')
    for (const line of ["WHEN 'high' THEN 1", "WHEN 'middle' THEN 4", "WHEN 'elementary' THEN 7", "WHEN 'university' THEN 0", "WHEN 'college' THEN 0"]) {
      expect(sql).toContain(line)
    }
  })

  it('checks the DB school type before any membership write', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.add_own_school_membership_with_roster'))
    expect(body.indexOf('FROM public.schools school')).toBeLessThan(body.indexOf('add_own_school_membership_with_class_history('))
    expect(body.indexOf("'CURRENT_STUDENT_GRADUATION_YEAR_NOT_ALLOWED'")).toBeLessThan(body.indexOf('INSERT INTO public.school_roster_consents'))
  })

  it('is additive only and keeps the browser entry point grants', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bRENAME\b|\bDELETE FROM\b|\bUPDATE public\./)
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)')
    expect(sql).toContain('TO authenticated, service_role;')
  })
})
