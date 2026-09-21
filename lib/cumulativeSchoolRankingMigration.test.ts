import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/migrations/20260921090000_cumulative_school_ranking.sql'), 'utf8')

describe('cumulative school ranking migration', () => {
  it('orders the public projection by published cumulative XP and returns five schools', () => {
    expect(sql).toContain('FROM private.school_growth_batches WHERE publish_at<=now()')
    expect(sql).toMatch(/row_number\(\) OVER\(ORDER BY xp DESC,school_id\)/)
    expect(sql).toMatch(/t\.xp>0[\s\S]*ORDER BY t\.xp DESC NULLS LAST,s\.id LIMIT 5/)
    expect(sql).toContain("'totalXp',xp")
    expect(sql).not.toContain("'weeklyXp'")
    expect(sql).not.toContain("interval '7 days'")
  })

  it('keeps the privileged surface bounded and explicitly granted', () => {
    expect(sql).toContain("SECURITY DEFINER SET search_path=''" )
    expect(sql).toContain('CREATE FUNCTION public.get_total_school_ranking(requested_school_id uuid DEFAULT NULL) RETURNS jsonb')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_total_school_ranking(uuid) FROM PUBLIC;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_total_school_ranking(uuid) TO anon,authenticated,service_role;')
    for (const privateField of ['user_id','owner_user_id','contributor_key','principal_key','graduation_year','class_number','instagram_handle']) {
      expect(sql).not.toContain(`'${privateField}'`)
    }
  })
})
