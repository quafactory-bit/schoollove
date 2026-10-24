import { SCHOOL_TYPE_LABELS, type SchoolType } from '@/types/school'

const KST_TIME_ZONE = 'Asia/Seoul'

type CalendarDate = { year: number; month: number; day: number }

function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const normalized = new Date(Date.UTC(year, month - 1, day))

  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

export function getKstCalendarDate(now = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)

  return { year: value('year'), month: value('month'), day: value('day') }
}

export function calculateAgeInKst(dateOfBirth: string, now = new Date()): number | null {
  const birth = parseCalendarDate(dateOfBirth)
  if (!birth) return null

  const today = getKstCalendarDate(now)
  let age = today.year - birth.year
  const birthdayPassed =
    today.month > birth.month || (today.month === birth.month && today.day >= birth.day)
  if (!birthdayPassed) age -= 1

  return age >= 0 && age <= 130 ? age : null
}

export function isAdultEligibleInKst(dateOfBirth: string, now = new Date()): boolean {
  const age = calculateAgeInKst(dateOfBirth, now)
  return age !== null && age >= 19
}

// v2-02: 졸업연도로 재학 중인 학교 등록을 구조적으로 막는다(KST 올해 기준).
// 고 ≤ Y−1, 중 ≤ Y−4, 초 ≤ Y−7, 대학·전문대학 ≤ Y. 하한은 1950.
export const MIN_GRADUATION_YEAR = 1950

const GRADUATION_YEAR_OFFSET: Record<SchoolType, number> = {
  high: 1,
  middle: 4,
  elementary: 7,
  university: 0,
  college: 0,
}

export function graduationYearRange(schoolType: SchoolType, now = new Date()): { min: number; max: number } {
  return { min: MIN_GRADUATION_YEAR, max: getKstCalendarDate(now).year - GRADUATION_YEAR_OFFSET[schoolType] }
}

export function isGraduationYearAllowed(schoolType: SchoolType, year: number, now = new Date()): boolean {
  const { min, max } = graduationYearRange(schoolType, now)
  return Number.isInteger(year) && year >= min && year <= max
}

export function graduationYearRangeNotice(schoolType: SchoolType, now = new Date()): string {
  const label = SCHOOL_TYPE_LABELS[schoolType]
  const particle = label.endsWith('학') ? '은' : '는'
  return `${label}${particle} ${graduationYearRange(schoolType, now).max}년 이하 졸업연도만 고를 수 있어요. 재학 중인 학교는 등록할 수 없어요.`
}
