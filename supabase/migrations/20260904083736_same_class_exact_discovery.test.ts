import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260904083736_same_class_exact_discovery.sql'), 'utf8').replace(/\r\n/g, '\n')

describe('SAME_CLASS exact discovery migration', () => {
  it('is additive: one new RPC only, with no table or column mutation', () => {
    expect(sql.match(/CREATE OR REPLACE FUNCTION public\./g)).toHaveLength(1)
    expect(sql).not.toMatch(/CREATE\s+(?:TABLE|TYPE|VIEW|MATERIALIZED|SCHEMA)|ALTER\s+TABLE/i)
    expect(sql).toContain('find_exact_private_profile_class_match')
    expect(sql).not.toContain('find_exact_private_profile_match(')
  })

  it('derives K12 bounds from public.schools and requires the actor owned history row', () => {
    expect(sql).toMatch(/SELECT school\.school_type[\s\S]*FROM public\.schools school/)
    expect(sql).toContain("WHEN 'elementary' THEN 6")
    expect(sql).toContain("WHEN 'middle' THEN 3")
    expect(sql).toContain("WHEN 'high' THEN 3")
    expect(sql).toContain('maximum_grade IS NULL')
    expect(sql).toContain('actor_membership.graduation_year = target_graduation_year')
    expect(sql).toContain('actor_history.grade_number = target_grade_number')
    expect(sql).toContain('actor_history.class_number = target_class_number')
  })

  it('requires exactly one eligible same-class receiver and retains coarse safety closure', () => {
    expect(sql).toContain('IF matched_count <> 1 THEN')
    expect(sql).toContain('profile.status = \'active\'')
    expect(sql).toContain('public.is_current_adult_account(matched_user)')
    expect(sql).toContain('public.user_blocks')
    expect(sql).toContain('public.connection_requests')
    expect(sql).toContain('public.connections')
  })

  it('uses the existing opaque-token table and has service-role-only execute authority', () => {
    expect(sql).toContain('INSERT INTO public.connection_match_tokens')
    expect(sql).toContain('token_hash, requester_user_id, receiver_user_id, target_school_membership_id')
    expect(sql).toContain("SECURITY DEFINER\nSET search_path = ''")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)')
    expect(sql).toContain('TO service_role')
  })
})
