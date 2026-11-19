import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

import { checkInitials, checkNote, readChalkboardDraft, saveChalkboardDraft, CHALKBOARD_KEY, CHALKBOARD_TTL_MS } from './part2Chalkboard'
import { getHomeAttendance, getSchoolRosterFlags, getYearMaskedPreview } from './part2Public'

const SQL = readFileSync(join(__dirname, '../supabase/migrations/20261119030000_part2_p1_public_previews.sql'), 'utf8')

describe('Part 2 P1 chalkboard input', () => {
  it('accepts initials that contain at least one bare consonant', () => {
    expect(checkInitials('김ㅇ수')).toEqual({ ok: true, value: '김ㅇ수' })
    expect(checkInitials(' ㄱ ㅁ ㅅ ')).toEqual({ ok: true, value: 'ㄱㅁㅅ' })
  })
  it('rejects complete names, latin text and wrong lengths', () => {
    expect(checkInitials('김민수')).toEqual({ ok: false, reason: 'full_name' })
    expect(checkInitials('kim')).toEqual({ ok: false, reason: 'characters' })
    expect(checkInitials('ㄱ')).toEqual({ ok: false, reason: 'length' })
    expect(checkInitials('ㄱㄴㄷㄹㅁ')).toEqual({ ok: false, reason: 'length' })
  })
  it('rejects contact details, ids and links in the note', () => {
    for (const note of ['010-1234-5678', '카톡 abc', '@myid', 'https://x.y', 'insta me', '전화 01012345678']) {
      expect(checkNote(note).ok).toBe(false)
    }
    expect(checkNote('반가워! 잘 지내?')).toEqual({ ok: true, value: '반가워! 잘 지내?' })
    expect(checkNote('가'.repeat(31))).toEqual({ ok: false, reason: 'length' })
  })
  it('keeps the draft in localStorage only and expires it after 7 days', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } })
    expect(saveChalkboardDraft({ slug: 's', year: 2005, initials: '김ㅇ수', note: '안녕' }, 1000)).toBe(true)
    expect(readChalkboardDraft(2000)).toMatchObject({ slug: 's', year: 2005, initials: '김ㅇ수' })
    expect(readChalkboardDraft(1000 + CHALKBOARD_TTL_MS + 1)).toBeNull()
    expect(store.has(CHALKBOARD_KEY)).toBe(false)
    store.set(CHALKBOARD_KEY, JSON.stringify({ slug: 's', year: 2005, initials: '김민수', note: '', savedAt: 1 }))
    expect(readChalkboardDraft(2)).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('Part 2 P1 public readers fail closed', () => {
  beforeEach(() => rpc.mockReset())
  it('returns only short masked strings and drops anything that looks like a full row', async () => {
    rpc.mockResolvedValueOnce({ data: [{ masked_name: '김O수' }, { masked_name: '이O' }], error: null })
    expect(await getYearMaskedPreview('id', 2005)).toEqual(['김O수', '이O'])
    rpc.mockResolvedValueOnce({ data: [{ masked_name: '김민수바보' }], error: null })
    expect(await getYearMaskedPreview('id', 2005)).toEqual([])
    rpc.mockResolvedValueOnce({ data: [{ masked_name: '김O수', display_name: '김민수' }], error: null })
    expect(await getYearMaskedPreview('id', 2005)).toEqual([])
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    expect(await getYearMaskedPreview('id', 2005)).toEqual([])
  })
  it('hides the home section on errors, malformed data or extra fields', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42883' } })
    expect(await getHomeAttendance()).toEqual({ visible: false })
    rpc.mockResolvedValueOnce({ data: { visible: true, recent_total: 3, ticker: [], top: [] }, error: null })
    expect(await getHomeAttendance()).toEqual({ visible: false })
    rpc.mockResolvedValueOnce({ data: { visible: true, recent_total: 6, ticker: [{ school_name: 'A', slug: 'a', graduation_year: 2005, count: 1, display_name: 'x' }], top: [] }, error: null })
    expect(await getHomeAttendance()).toEqual({ visible: false })
  })
  it('returns badge flags only for valid rows and caps the request at 50 ids', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    rpc.mockResolvedValueOnce({ data: [{ school_id: ids[0], has_roster: true }, { school_id: ids[1], has_roster: false }], error: null })
    expect(await getSchoolRosterFlags(ids)).toEqual({ [ids[0]]: true, [ids[1]]: false })
    expect(rpc.mock.calls[0][1].p_school_ids).toHaveLength(50)
    expect(await getSchoolRosterFlags([])).toEqual({})
  })
})

describe('Part 2 P1 migration contract', () => {
  it('is add-only: new functions, no table, no drop/rename/alter of existing objects', () => {
    expect(SQL).not.toMatch(/CREATE TABLE|DROP |RENAME|ALTER TABLE|CREATE OR REPLACE|DELETE |UPDATE public|INSERT INTO/i)
    expect(SQL.match(/CREATE FUNCTION public\.part2_/g)).toHaveLength(4)
  })
  it('masks names in SQL and never returns raw display names, ids or timestamps', () => {
    expect(SQL).toContain("left(clean.name, 1) || 'O' || right(clean.name, 1)")
    expect(SQL).toContain("left(clean.name, 1) || 'O'")
    expect(SQL).toContain('RETURNS TABLE(masked_name text)')
    expect(SQL).not.toMatch(/'latest'|'owner_user_id'|'instagram/i)
  })
  it('hides home LIVE/TOP below 5 check-ins in 7 days and keeps popular schools server-only', () => {
    expect(SQL).toContain("IF recent_total < 5 THEN\n    RETURN jsonb_build_object('visible', false);")
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.part2_popular_schools() FROM PUBLIC, anon, authenticated;')
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.part2_popular_schools() TO service_role;')
    expect(SQL).toContain('HAVING sum(funnel.event_count) >= 3')
  })
})
