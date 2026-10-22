import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20261022130000_v2_school_year_counts.sql', 'utf8')

describe('v2-04 school_year_counts_v2 migration', () => {
  it('returns only graduation year and count', () => {
    expect(sql).toContain('RETURNS TABLE(graduation_year integer, count integer)')
    const select = sql.slice(sql.indexOf('SELECT'), sql.indexOf('FROM public.profile_school_memberships'))
    expect(select).not.toMatch(/display_name|owner_user_id|profile_id|instagram|\bid\b/)
  })

  it('counts only roster-visible memberships of active private profiles for one school, newest year first', () => {
    expect(sql).toContain('consent.withdrawn_at IS NULL')
    expect(sql).toContain("profile.status = 'active'")
    expect(sql).toContain('WHERE membership.school_id = p_school_id')
    expect(sql).toContain('HAVING count(*) >= 1')
    expect(sql).toContain('ORDER BY membership.graduation_year DESC')
  })

  it('is a read-only security definer exposed to anon and authenticated, with no destructive statements', () => {
    expect(sql).toContain('STABLE')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain("SET search_path = ''")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.school_year_counts_v2(uuid) TO anon, authenticated, service_role')
    expect(sql).not.toMatch(/\bDROP\b|\bRENAME\b|\bDELETE\b|\bUPDATE\b|\bINSERT\b|CREATE TABLE/)
  })
})
