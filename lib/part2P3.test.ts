import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkStatusTags, checkSummonsName, summonsCardTitle } from './part2P3'

const SQL = readFileSync(join(__dirname, '../supabase/migrations/20261119120000_part2_p3_status_tags_and_summons.sql'), 'utf8')
const PAGE = readFileSync(join(__dirname, '../app/summons/[code]/page.tsx'), 'utf8')
const OG = readFileSync(join(__dirname, '../app/summons/[code]/opengraph-image.tsx'), 'utf8')
const ACTIONS = readFileSync(join(__dirname, '../components/part2/SummonsPublicActions.tsx'), 'utf8')
const RATE = readFileSync(join(__dirname, 'security/part2SummonsRateLimit.ts'), 'utf8')

describe('Part 2 P3 status tags', () => {
  it('accepts up to 3 listed tags and a short note without contacts', () => {
    expect(checkStatusTags({ tags: ['직장인', '육아 중'], note: ' 반가워! ', show_on_school_page: true })).toEqual({ ok: true, value: { tags: ['직장인', '육아 중'], note: '반가워!', show_on_school_page: true } })
    expect(checkStatusTags({ tags: [], note: '', show_on_school_page: false })).toEqual({ ok: true, value: { tags: [], note: null, show_on_school_page: false } })
  })
  it('rejects unknown/duplicate/too many tags, long notes, contacts and non-boolean switches', () => {
    expect(checkStatusTags({ tags: ['학생'], note: null, show_on_school_page: false })).toMatchObject({ ok: false, reason: 'tags' })
    expect(checkStatusTags({ tags: ['직장인', '직장인'], note: null, show_on_school_page: false })).toMatchObject({ ok: false, reason: 'tags' })
    expect(checkStatusTags({ tags: ['직장인', '자영업', '프리랜서', '쉬는 중'], note: null, show_on_school_page: false })).toMatchObject({ ok: false, reason: 'tags' })
    expect(checkStatusTags({ tags: [], note: '가'.repeat(31), show_on_school_page: false })).toMatchObject({ ok: false, reason: 'note_length' })
    for (const note of ['카톡 abc', '010-1234', '@id', 'insta me', 'www.x']) expect(checkStatusTags({ tags: [], note, show_on_school_page: false })).toMatchObject({ ok: false, reason: 'note_contact' })
    expect(checkStatusTags({ tags: [], note: null, show_on_school_page: 'yes' })).toMatchObject({ ok: false, reason: 'show' })
  })
})

describe('Part 2 P3 summons name rules', () => {
  it('accepts plain names', () => {
    expect(checkSummonsName(' 김민수 ')).toEqual({ ok: true, value: '김민수' })
    expect(checkSummonsName('Kim Minsu')).toEqual({ ok: true, value: 'Kim Minsu' })
  })
  it('rejects student wording, abuse, contacts and bad lengths', () => {
    expect(checkSummonsName('고딩 김민수')).toMatchObject({ ok: false, reason: 'blocked' })
    expect(checkSummonsName('바보 철수')).toMatchObject({ ok: false, reason: 'blocked' })
    expect(checkSummonsName('010')).toMatchObject({ ok: false, reason: 'characters' })
    expect(checkSummonsName('a@b')).toMatchObject({ ok: false, reason: 'characters' })
    expect(checkSummonsName('김')).toMatchObject({ ok: false, reason: 'length' })
    expect(checkSummonsName('김민수김민수김민수김민')).toMatchObject({ ok: false, reason: 'length' })
  })
  it('card title follows the operator wording', () => {
    expect(summonsCardTitle('서초고', 2008, '김민수')).toBe("[출석부 알림] 서초고 2008년 졸업생 누군가가 '김민수'님을 찾고 있습니다")
  })
})

describe('Part 2 P3 safety contract (schema and pages)', () => {
  it('new tables: RLS enabled + forced, every client privilege revoked, explicit grants only', () => {
    for (const table of ['profile_status_tags', 'summons']) {
      expect(SQL).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(SQL).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`)
      expect(SQL).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated, service_role;`)
      expect(SQL).toContain(`GRANT SELECT ON public.${table} TO service_role;`)
    }
    expect(SQL).not.toMatch(/GRANT [A-Z, ]+ ON public\.(profile_status_tags|summons) TO (anon|authenticated)/)
    expect(SQL).not.toMatch(/DROP |RENAME|CREATE OR REPLACE|ALTER TABLE public\.(?!profile_status_tags|summons)/)
  })
  it('takedown/report/admin are server-only; create/list/hide need a login', () => {
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.part2_request_summons_takedown(text) TO service_role;')
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.part2_report_summons(text) TO service_role;')
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.part2_create_summons(uuid, integer, text) FROM PUBLIC, anon;')
    expect(SQL).toContain("IF today_count >= 3 THEN RAISE EXCEPTION 'SUMMONS_DAILY_LIMIT'")
    expect(SQL).toContain("RAISE EXCEPTION 'SAME_SCHOOL_YEAR_REQUIRED'")
    expect(SQL).toContain("IF members < 3 THEN")
  })
  it('public summons card/page show only school, year and name, are noindex and always offer takedown + report', () => {
    expect(SQL).toContain('RETURNS TABLE(school_name text, school_slug text, graduation_year integer, target_name text)')
    expect(PAGE).toContain('const NOINDEX')
    expect(PAGE).toContain('robots: NOINDEX')
    // Data access only: the page/card never reads a creator or Instagram field.
    expect(PAGE).not.toMatch(/creator_user_id|instagram_handle|summons\.creator|summons\.instagram/)
    expect(OG).not.toMatch(/creator_user_id|instagram_handle|summons\.creator|summons\.instagram/)
    expect(ACTIONS).toContain('내 이름이 올라갔어요 · 내려 주세요')
    expect(ACTIONS).toContain('부적절한 소환장 신고')
    expect(RATE).toContain("const failOpen = action === 'takedown'")
  })
})
