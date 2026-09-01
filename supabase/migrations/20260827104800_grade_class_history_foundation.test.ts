import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260827104800_grade_class_history_foundation.sql'),
  'utf8',
)
const normalizedSql = sql.replace(/\r\n/g, '\n')

describe('PHASE 10AA grade/class history migration', () => {
  it('학교 membership 아래 정확히 한 child table을 추가하고 legacy column을 보존한다', () => {
    expect(sql).toContain('CREATE TABLE public.profile_school_class_histories')
    expect(sql).not.toMatch(/ALTER TABLE public\.profile_school_memberships\s+DROP COLUMN class_number/i)
    expect(sql).not.toMatch(/ALTER TABLE public\.profile_school_memberships\s+ADD COLUMN grade_number/i)
    expect(sql).toContain('CHECK (class_number IS NULL) NOT VALID')
    expect(sql).toContain("'class_number', saved.class_number")
  })

  it('parent owner 일치, 학년 유일성, class 범위와 cascade를 DB constraint로 고정한다', () => {
    expect(sql).toContain('FOREIGN KEY (membership_id, owner_user_id)')
    expect(sql).toContain('REFERENCES public.profile_school_memberships(id, owner_user_id)')
    expect(sql).toContain('ON DELETE CASCADE')
    expect(sql).toContain('UNIQUE (membership_id, grade_number)')
    expect(sql).toContain('CHECK (class_number BETWEEN 1 AND 100)')
  })

  it('학교 유형은 DB에서 조회하고 K12 범위만 허용한다', () => {
    expect(sql).toMatch(/SELECT school\.school_type[\s\S]*FROM public\.schools school/)
    expect(sql).toContain("WHEN 'elementary' THEN 6")
    expect(sql).toContain("WHEN 'middle' THEN 3")
    expect(sql).toContain("WHEN 'high' THEN 3")
    expect(sql).toContain('GRADE_CLASS_HISTORY_NOT_ALLOWED_FOR_SCHOOL_TYPE')
  })

  it('membership과 모든 child row를 하나의 owner-safe RPC transaction에서 저장한다', () => {
    expect(sql).toContain('add_own_school_membership_with_class_history')
    expect(sql).toContain('requester uuid := auth.uid()')
    expect(sql).toContain('INSERT INTO public.profile_school_memberships')
    expect(sql).toContain('INSERT INTO public.profile_school_class_histories')
    expect(sql).toContain('DUPLICATE_GRADE_CLASS_HISTORY')
    expect(normalizedSql).toContain('VALUES (\n    own_profile.id,\n    requester,')
    expect(normalizedSql).toContain('requested_graduation_year,\n    NULL')
  })

  it('owner select만 허용하고 browser mutation과 legacy RPC를 닫는다', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('FOR SELECT TO authenticated')
    expect(sql).toContain('owner_user_id = (SELECT auth.uid())')
    expect(sql).toContain('REVOKE ALL ON TABLE public.profile_school_class_histories FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT SELECT ON TABLE public.profile_school_class_histories TO authenticated')
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]{0,120}FOR (INSERT|UPDATE|DELETE) TO authenticated/)
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.add_own_school_membership(uuid, integer, integer)')
  })

  it('legacy 값을 grade로 backfill하거나 사람 검색 계약을 변경하지 않는다', () => {
    expect(sql).not.toMatch(/INSERT INTO public\.profile_school_class_histories[\s\S]*SELECT[\s\S]*profile_school_memberships/i)
    expect(sql).not.toMatch(/search_people|find_people|create_people_match_token/i)
  })
})
