// Part 2 P1: logged-out chalkboard. Initials and a short note stay in this browser's localStorage only
// (never sent to the server before login). Full names are rejected: at least one bare consonant is required.

export const CHALKBOARD_KEY = 'sl_p2_chalkboard'
export const CHALKBOARD_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const CHALKBOARD_NOTE_MAX = 30

export type ChalkboardDraft = { slug: string; year: number; initials: string; note: string; savedAt: number }

const HANGUL_PIECE = /^[가-힣ㄱ-ㅎ]+$/
const BARE_CONSONANT = /[ㄱ-ㅎ]/
const CONTACT_LIKE = /(https?:|www\.|@|\d{3,}|카톡|카카오|오픈채팅|인스타|instagram|insta|010)/i

export type InitialsCheck = { ok: true; value: string } | { ok: false; reason: 'length' | 'characters' | 'full_name' }

/** "김ㅇ수", "ㄱㅁㅅ" OK. "김민수"(완성형 이름) rejected. 2~4 Korean characters. */
export function checkInitials(raw: string): InitialsCheck {
  const value = raw.replace(/\s+/g, '')
  if (value.length < 2 || value.length > 4) return { ok: false, reason: 'length' }
  if (!HANGUL_PIECE.test(value)) return { ok: false, reason: 'characters' }
  if (!BARE_CONSONANT.test(value)) return { ok: false, reason: 'full_name' }
  return { ok: true, value }
}

export type NoteCheck = { ok: true; value: string } | { ok: false; reason: 'length' | 'contact' }

export function checkNote(raw: string): NoteCheck {
  const value = raw.replace(/\s+/g, ' ').trim()
  if (value.length > CHALKBOARD_NOTE_MAX) return { ok: false, reason: 'length' }
  if (CONTACT_LIKE.test(value)) return { ok: false, reason: 'contact' }
  return { ok: true, value }
}

export function saveChalkboardDraft(draft: Omit<ChalkboardDraft, 'savedAt'>, now = Date.now()): boolean {
  try {
    window.localStorage.setItem(CHALKBOARD_KEY, JSON.stringify({ ...draft, savedAt: now }))
    return true
  } catch {
    return false
  }
}

export function readChalkboardDraft(now = Date.now()): ChalkboardDraft | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CHALKBOARD_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return null
    const { slug, year, initials, note, savedAt } = raw as Record<string, unknown>
    if (typeof slug !== 'string' || slug.length === 0 || slug.length > 200) return null
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 1950 || year > 2100) return null
    if (typeof initials !== 'string' || !checkInitials(initials).ok) return null
    if (typeof note !== 'string' || !checkNote(note).ok) return null
    if (typeof savedAt !== 'number' || savedAt > now || now - savedAt > CHALKBOARD_TTL_MS) {
      clearChalkboardDraft()
      return null
    }
    return { slug, year, initials, note, savedAt }
  } catch {
    return null
  }
}

export function clearChalkboardDraft(): void {
  try { window.localStorage.removeItem(CHALKBOARD_KEY) } catch { /* optional storage */ }
}
