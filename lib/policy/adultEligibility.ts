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
