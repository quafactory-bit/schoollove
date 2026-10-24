// v2-06: 출석부(기수 명단) 화면 규칙. 기존 명단 RPC(get_school_member_roster)가 돌려주는 이름·졸업연도·반만 쓰고
// 새 컬럼·테이블 없이 화면에서 계산한다. "새로 들어온 동문"과 "요청 보냄"은 이 기기의 로컬 기록으로만 판단한다.
export type RosterEntry = {
  display_name: string
  graduation_year: number
  class_history: Array<{ grade_number: number; class_number: number }>
}

export type RosterTabKey = 'mine' | 'prev' | 'next' | 'all'
export type RosterTab = { key: RosterTabKey; label: string; count: number }
export type RosterRowAction = 'request' | 'sent' | 'accept' | 'me'

export const NEW_MEMBER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const NEW_MEMBER_STRIP_LIMIT = 5

// 기기에 남기는 키는 이름 원문 대신 짧은 해시(FNV-1a)로 만든다. 로컬 기록 비교용이며 보안 장치는 아니다.
export function rosterEntryKey(entry: Pick<RosterEntry, 'display_name' | 'graduation_year'>): string {
  const text = `${entry.graduation_year}|${entry.display_name.normalize('NFKC').trim()}`
  let hash = 0x811c9dc5
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `r${entry.graduation_year}-${hash.toString(36)}`
}

export function rosterTabs(entries: RosterEntry[], myYear: number): RosterTab[] {
  const count = (year: number) => entries.filter(entry => entry.graduation_year === year).length
  return [
    { key: 'mine', label: String(myYear), count: count(myYear) },
    { key: 'prev', label: String(myYear - 1), count: count(myYear - 1) },
    { key: 'next', label: String(myYear + 1), count: count(myYear + 1) },
    { key: 'all', label: '전체', count: entries.length },
  ]
}

export function filterRoster(entries: RosterEntry[], tab: RosterTabKey, myYear: number, nameQuery = ''): RosterEntry[] {
  const year = tab === 'mine' ? myYear : tab === 'prev' ? myYear - 1 : tab === 'next' ? myYear + 1 : null
  const query = nameQuery.normalize('NFKC').replace(/\s+/g, '')
  return entries.filter(entry => (year === null || entry.graduation_year === year)
    && (!query || entry.display_name.normalize('NFKC').replace(/\s+/g, '').includes(query)))
}

// 처음 본 시각 기록(로컬)으로 최근 7일 안에 처음 나타난 동문을 고른다. 기록이 아예 없던 첫 방문에는
// 지금 보이는 사람을 모두 "이미 본 사람"(시각 0)으로 저장해 전원이 새 동문으로 뜨지 않게 한다.
export function updateFirstSeen(entries: RosterEntry[], firstSeen: Record<string, number>, now: number): Record<string, number> {
  const firstVisit = Object.keys(firstSeen).length === 0
  const next: Record<string, number> = {}
  for (const entry of entries) {
    const key = rosterEntryKey(entry)
    next[key] = firstSeen[key] ?? (firstVisit ? 0 : now)
  }
  return next
}

export function newMembers(entries: RosterEntry[], firstSeen: Record<string, number>, now: number, excludeKey?: string): RosterEntry[] {
  return entries.filter(entry => {
    const key = rosterEntryKey(entry)
    const seen = firstSeen[key]
    return key !== excludeKey && typeof seen === 'number' && seen > 0 && now - seen <= NEW_MEMBER_WINDOW_MS
  })
}

export function rosterRowAction(entry: RosterEntry, meKey: string | null, sentKeys: ReadonlySet<string>): RosterRowAction {
  const key = rosterEntryKey(entry)
  if (key === meKey) return 'me'
  return sentKeys.has(key) ? 'sent' : 'request'
}

export function inviteLink(origin: string, slug: string, year: number): string {
  return `${origin}/school/${encodeURIComponent(slug)}/${year}`
}

export const ROSTER_REQUEST_MESSAGE = '출석부에서 인스타 주소를 요청했어요'
