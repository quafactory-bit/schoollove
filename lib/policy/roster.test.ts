import { describe, expect, it } from 'vitest'
import { containsExternalContact } from './connectionSafety'
import {
  NEW_MEMBER_WINDOW_MS, ROSTER_REQUEST_MESSAGE, filterRoster, inviteLink, newMembers, rosterEntryKey,
  rosterRowAction, rosterTabs, updateFirstSeen, type RosterEntry,
} from './roster'

const entry = (display_name: string, graduation_year: number): RosterEntry => ({ display_name, graduation_year, class_history: [] })
const roster = [entry('최유진', 2005), entry('김민수', 2005), entry('이서연', 2006), entry('박지훈', 2004), entry('박완', 2005)]

describe('v2-06 roster tabs and filter', () => {
  it('counts my year, ±1 and all', () => {
    expect(rosterTabs(roster, 2005)).toEqual([
      { key: 'mine', label: '2005', count: 3 },
      { key: 'prev', label: '2004', count: 1 },
      { key: 'next', label: '2006', count: 1 },
      { key: 'all', label: '전체', count: 5 },
    ])
  })

  it('filters by tab and by a client-side name query (no server search)', () => {
    expect(filterRoster(roster, 'mine', 2005).map(row => row.display_name)).toEqual(['최유진', '김민수', '박완'])
    expect(filterRoster(roster, 'all', 2005, '박').map(row => row.display_name)).toEqual(['박지훈', '박완'])
    expect(filterRoster(roster, 'next', 2005, '이 서')).toHaveLength(1)
  })
})

describe('v2-06 new members strip (local first-seen only)', () => {
  const now = 1_800_000_000_000
  it('does not flag everyone as new on the first visit', () => {
    const seen = updateFirstSeen(roster, {}, now)
    expect(newMembers(roster, seen, now)).toEqual([])
  })

  it.each([0, 1, 6])('flags %i people who first appeared within 7 days', count => {
    const base = updateFirstSeen(roster, {}, now - NEW_MEMBER_WINDOW_MS * 2)
    const joined = Array.from({ length: count }, (_, index) => entry(`새친구${index}`, 2005))
    const seen = updateFirstSeen([...roster, ...joined], base, now - 1000)
    expect(newMembers([...roster, ...joined], seen, now)).toHaveLength(count)
  })

  it('drops people after 7 days and never counts me', () => {
    const base = updateFirstSeen(roster, {}, 0)
    const seen = updateFirstSeen([...roster, entry('새친구', 2005)], base, now - NEW_MEMBER_WINDOW_MS - 1)
    expect(newMembers([...roster, entry('새친구', 2005)], seen, now)).toEqual([])
    const fresh = updateFirstSeen([...roster, entry('나', 2005)], base, now)
    expect(newMembers([...roster, entry('나', 2005)], fresh, now, rosterEntryKey(entry('나', 2005)))).toEqual([])
  })
})

describe('v2-06 row actions', () => {
  it('maps me / sent / request', () => {
    const me = rosterEntryKey(entry('박완', 2005))
    const sent = new Set([rosterEntryKey(entry('김민수', 2005))])
    expect(rosterRowAction(entry('박완', 2005), me, sent)).toBe('me')
    expect(rosterRowAction(entry('김민수', 2005), me, sent)).toBe('sent')
    expect(rosterRowAction(entry('최유진', 2005), me, sent)).toBe('request')
  })

  it('uses a fixed request text that passes the existing external-contact guard', () => {
    expect(containsExternalContact(ROSTER_REQUEST_MESSAGE)).toBe(false)
  })

  it('builds the per-year invite link to the public year page', () => {
    expect(inviteLink('https://www.schoollove.kr', 'seoul-high', 2005)).toBe('https://www.schoollove.kr/school/seoul-high/2005')
  })
})
