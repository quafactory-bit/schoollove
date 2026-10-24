import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20261023100000_v2_search_schools_activity_wrapper_fix.sql', 'utf8')
const original = readFileSync('supabase/migrations/20260803120000_public_account_soft_launch.sql', 'utf8')

describe('v2-01 search_schools_with_activity wrapper fix', () => {
  it('keeps the exact public signature and return shape of the original wrapper', () => {
    const shape = 'RETURNS TABLE(id uuid,school_name text,school_type text,sido text,sigungu text,slug text,address text,school_code text,created_at timestamptz)'
    expect(original.replace(/\s+/g, '')).toContain(shape.replace(/\s+/g, ''))
    expect(sql.replace(/\s+/g, '')).toContain(shape.replace(/\s+/g, ''))
    expect(sql).toContain('search_schools_with_activity(q text, lim integer DEFAULT 20)')
    expect(sql).toContain("IF char_length(btrim(q)) < 2 OR lim NOT BETWEEN 1 AND 50 THEN RETURN; END IF;")
  })

  it('selects the nine declared columns by name in declared order instead of SELECT *', () => {
    const body = sql.slice(sql.lastIndexOf('RETURN QUERY'))
    expect(body).not.toMatch(/SELECT \*/)
    const order = ['school.id', 'school.school_name', 'school.school_type', 'school.sido', 'school.sigungu', 'school.slug', 'school.address', 'school.school_code', 'school.created_at']
    const positions = order.map(column => body.indexOf(column))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(body).not.toMatch(/search_blob|current_level|level_updated_at/)
  })

  it('records the query-free activity metric best-effort so statistics never block search', () => {
    const guarded = sql.slice(sql.lastIndexOf('BEGIN', sql.indexOf('PERFORM public.increment')), sql.lastIndexOf('RETURN QUERY'))
    expect(guarded).toContain("PERFORM public.increment_public_account_metric('school_search_started', 'school_search', 'activity');")
    expect(guarded).toContain('EXCEPTION WHEN OTHERS THEN')
    expect(sql).not.toMatch(/\bq\b[^,)]*increment_public_account_metric|search_logs/)
  })

  it('is additive only and keeps the existing grants', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bRENAME\b|\bDELETE\b|\bUPDATE public\.|CREATE TABLE/)
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.search_schools_with_activity(text, integer) FROM PUBLIC;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_schools_with_activity(text, integer) TO anon, authenticated, service_role;')
  })
})
