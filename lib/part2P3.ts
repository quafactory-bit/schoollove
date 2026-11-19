// Part 2 P3 shared rules (browser + server). The database enforces the same rules again.

export const STATUS_TAGS = ['직장인', '자영업', '프리랜서', '육아 중', '공부 중', '쉬는 중', '이직 준비', '해외 거주'] as const
export type StatusTag = (typeof STATUS_TAGS)[number]
export const STATUS_TAG_MAX = 3
export const STATUS_NOTE_MAX = 30
export const SUMMONS_DAILY_LIMIT = 3
export const CHALKBOARD_UNLOCK_MEMBERS = 3

const CONTACT_LIKE = /(https?:|www\.|@|[0-9]{3,}|카톡|카카오|오픈채팅|인스타|instagram|insta)/i
const SUMMONS_BLOCKED = /(학생|초딩|중딩|고딩|학년|교복|씨발|시발|병신|개새|좆|존나|미친|바보|fuck|shit|bitch)/i
export const SUMMONS_CODE = /^[a-f0-9]{12}$/

export type StatusTagsInput = { tags: StatusTag[]; note: string | null; show_on_school_page: boolean }

export function checkStatusTags(input: { tags: unknown; note: unknown; show_on_school_page: unknown }):
  { ok: true; value: StatusTagsInput } | { ok: false; reason: 'tags' | 'note_length' | 'note_contact' | 'show' } {
  if (!Array.isArray(input.tags) || input.tags.length > STATUS_TAG_MAX || new Set(input.tags).size !== input.tags.length
    || !input.tags.every((tag) => (STATUS_TAGS as readonly unknown[]).includes(tag))) return { ok: false, reason: 'tags' }
  if (typeof input.show_on_school_page !== 'boolean') return { ok: false, reason: 'show' }
  const raw = input.note
  if (raw !== null && typeof raw !== 'string') return { ok: false, reason: 'note_length' }
  const note = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (note.length > STATUS_NOTE_MAX) return { ok: false, reason: 'note_length' }
  if (note && CONTACT_LIKE.test(note)) return { ok: false, reason: 'note_contact' }
  return { ok: true, value: { tags: input.tags as StatusTag[], note: note || null, show_on_school_page: input.show_on_school_page } }
}

/** Summons target name: 2~10 Korean/latin letters, no student wording, no abuse, no contacts. */
export function checkSummonsName(raw: unknown): { ok: true; value: string } | { ok: false; reason: 'length' | 'characters' | 'blocked' } {
  if (typeof raw !== 'string') return { ok: false, reason: 'characters' }
  const value = raw.replace(/\s+/g, ' ').trim()
  if (value.length < 2 || value.length > 10) return { ok: false, reason: 'length' }
  if (!/^[가-힣A-Za-z ]+$/.test(value)) return { ok: false, reason: 'characters' }
  if (SUMMONS_BLOCKED.test(value)) return { ok: false, reason: 'blocked' }
  return { ok: true, value }
}

export const SUMMONS_NAME_ERRORS = {
  length: '이름은 2~10글자로 적어 주세요.',
  characters: '이름은 한글·영문만 쓸 수 있어요. 숫자·연락처·아이디는 안 돼요.',
  blocked: '학생으로 보이는 표현이나 거친 말은 쓸 수 없어요.',
} as const

export const SUMMONS_ERRORS: Record<string, string> = {
  SAME_SCHOOL_YEAR_REQUIRED: '같은 학교·졸업연도에 등록된 경우에만 만들 수 있어요.',
  SUMMONS_NAME_REJECTED: SUMMONS_NAME_ERRORS.blocked,
  SUMMONS_DAILY_LIMIT: '소환장은 하루 3장까지 만들 수 있어요.',
  ACCOUNT_ACCESS_REQUIRED: '지금은 소환장을 만들 수 없어요.',
}

export function summonsCardTitle(schoolShortName: string, year: number, targetName: string): string {
  return `[출석부 알림] ${schoolShortName} ${year}년 졸업생 누군가가 '${targetName}'님을 찾고 있습니다`
}
