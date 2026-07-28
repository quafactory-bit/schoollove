import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260728120000_profiles_private_safety_boundary.sql'),
  'utf8',
)

describe('PHASE 10A profiles private safety boundary migration', () => {
  it('retains rows while revoking every public table operation', () => {
    expect(sql).toMatch(/REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public\.profiles FROM anon, authenticated;/)
    expect(sql).not.toMatch(/\bDELETE FROM public\.profiles\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
  })

  it('revokes historical column grants and drops known public policies', () => {
    expect(sql).toMatch(/REVOKE SELECT \([\s\S]*nickname[\s\S]*instagram_id[\s\S]*\) ON public\.profiles FROM anon, authenticated;/)
    expect(sql).toContain('DROP POLICY IF EXISTS "profiles_read" ON public.profiles;')
    expect(sql).toContain('DROP POLICY IF EXISTS "profiles_select_visible" ON public.profiles;')
    expect(sql).toContain('DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;')
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*TO anon|GRANT SELECT[\s\S]*TO anon/i)
  })

  it('revokes the profile-derived public ranking RPC without changing service_role', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.school_growth_ranking_v1\([\s\S]*\) FROM PUBLIC, anon, authenticated;/)
    expect(sql).not.toMatch(/FROM service_role|TO service_role/i)
  })
})
