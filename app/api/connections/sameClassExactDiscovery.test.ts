import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const migration = read('supabase/migrations/20260904083736_same_class_exact_discovery.sql')
const route = read('app/api/connections/search/route.ts')
const service = read('lib/connections.ts')
const client = read('app/people/search/PeopleSearchClient.tsx')

describe('same-class exact discovery contract', () => {
  it('adds only a service-role class-match function and no schema expansion', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.find_exact_private_profile_class_match')
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = ''")
    expect(migration).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE[\s\S]*ADD\s+COLUMN/i)
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)')
    expect(migration).toContain('TO service_role')
  })

  it('requires owned class history, K12 authority, and exactly one eligible receiver', () => {
    for (const clause of [
      'actor_membership.graduation_year = target_graduation_year',
      'actor_history.grade_number = target_grade_number',
      'actor_history.class_number = target_class_number',
      "WHEN 'elementary' THEN 6",
      "WHEN 'middle' THEN 3",
      "WHEN 'high' THEN 3",
      'IF matched_count <> 1 THEN',
      'public.is_current_adult_account(matched_user)',
      'public.connection_match_tokens',
    ]) expect(migration).toContain(clause)
  })

  it('keeps response data opaque and routes only explicit same_class requests', () => {
    expect(route).toContain("'search_mode' in parsed.data")
    expect(route).toContain('findExactClassConnectionMatch')
    expect(service).toContain("rpc('find_exact_private_profile_class_match'")
    expect(service).not.toMatch(/findExactClassConnectionMatch[\s\S]*receiverUserId/)
    expect(client).toContain('같은 반까지 기억나요')
    expect(client).toContain("search_mode: 'same_class'")
    expect(client).toContain("setRelationship(sameClassMode ? 'same_class' : 'same_school')")
  })
})
