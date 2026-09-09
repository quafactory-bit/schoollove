import { SCHOOL_SEARCH_STORAGE_KEY } from './schoolSearchAutocomplete'

export const SCHOOL_INTENT_KEY = 'sl_school_candidate_v1'
export const SCHOOL_INTENT_TTL = 30 * 60 * 1000
export const validSchoolSlug = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200
export type SchoolIntent = { slug: string; expiresAt: number }
// Public school query only. Memory fallback survives same-tab client navigation,
// not a reload; neither value is a private person-search condition.
let schoolQuery = ''
let claimedIntent: SchoolIntent | null = null
let currentOwner: string | null = null // memory only; never serialized
export function rememberSchoolQuery(query: string) {
  schoolQuery = query
  try { sessionStorage.setItem(SCHOOL_SEARCH_STORAGE_KEY, query) } catch { /* memory fallback */ }
}
export function recallSchoolQuery() {
  try { return sessionStorage.getItem(SCHOOL_SEARCH_STORAGE_KEY) || schoolQuery } catch { return schoolQuery }
}
export function parseSchoolIntent(raw: string | null, now = Date.now()): SchoolIntent | null {
  try {
    const value = JSON.parse(raw || 'null')
    if (!value || Object.keys(value).sort().join(',') !== 'expiresAt,slug' || !validSchoolSlug(value.slug) ||
      !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + SCHOOL_INTENT_TTL) return null
    return { slug: value.slug, expiresAt: value.expiresAt }
  } catch { return null }
}
export function clearSchoolIntent() {
  claimedIntent = null
  try { sessionStorage.removeItem(SCHOOL_INTENT_KEY) } catch { /* no persistent fallback */ }
}
export function readSchoolIntent() {
  if (claimedIntent) {
    if (claimedIntent.expiresAt > Date.now()) return claimedIntent
    clearSchoolIntent()
    return null
  }
  try {
    const intent = parseSchoolIntent(sessionStorage.getItem(SCHOOL_INTENT_KEY))
    if (!intent) clearSchoolIntent()
    return intent
  } catch { return null }
}
export function saveSchoolIntent(slug: string): boolean {
  clearSchoolIntent()
  if (!validSchoolSlug(slug)) return false
  try { sessionStorage.setItem(SCHOOL_INTENT_KEY, JSON.stringify({ slug, expiresAt: Date.now() + SCHOOL_INTENT_TTL })); return true } catch { return false }
}
// Consume the persistent hint on authenticated arrival. A subsequent reload or
// account switch cannot inherit it; same-tab onboarding navigation can retain it
// in memory for the same principal only. None of this grants write authority.
export function claimSchoolIntent(owner: string) {
  if (currentOwner && currentOwner !== owner) { clearSchoolIntent(); currentOwner = owner; return null }
  currentOwner = owner
  const intent = readSchoolIntent()
  try { sessionStorage.removeItem(SCHOOL_INTENT_KEY) } catch { /* no storage */ }
  claimedIntent = intent
  return intent
}
