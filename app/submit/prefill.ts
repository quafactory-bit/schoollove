export const SUBMIT_MIN_GRADUATION_YEAR = 1970
export const SUBMIT_MAX_GRADUATION_YEAR = 2032

export type SubmitPrefill = {
  schoolSlug: string | null
  graduationYear: string
  grade: string
  classNumber: string
  selfMode: boolean
}

type SearchParamsReader = Pick<URLSearchParams, 'get'>

type SubmitContext = {
  school: string
  year?: number
  grade?: number
  classNumber?: number
  self?: boolean
}

function parsePositiveInteger(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) return null
  return value
}

export function parseSubmitPrefill(searchParams: SearchParamsReader): SubmitPrefill {
  const rawSchool = searchParams.get('school')?.trim() ?? ''
  const parsedYear = parsePositiveInteger(searchParams.get('year'))
  const parsedGrade = parsePositiveInteger(searchParams.get('grade'))
  const parsedClass = parsePositiveInteger(searchParams.get('class'))

  const graduationYear =
    parsedYear !== null &&
    parsedYear >= SUBMIT_MIN_GRADUATION_YEAR &&
    parsedYear <= SUBMIT_MAX_GRADUATION_YEAR
      ? String(parsedYear)
      : ''

  return {
    schoolSlug: rawSchool || null,
    graduationYear,
    grade: parsedGrade !== null && parsedGrade <= 6 ? String(parsedGrade) : '',
    classNumber: parsedClass !== null ? String(parsedClass) : '',
    selfMode: searchParams.get('self') === '1',
  }
}

export function gradeForSchoolType(grade: string, schoolType: string): string {
  if (!grade) return ''
  if (schoolType === 'university' || schoolType === 'college') return ''
  const gradeMax = schoolType === 'elementary' ? 6 : 3
  const parsed = Number(grade)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= gradeMax ? grade : ''
}

export function buildSubmitContextHref(context: SubmitContext): string {
  const params = new URLSearchParams()
  params.set('school', context.school)
  if (context.year !== undefined) params.set('year', String(context.year))
  if (context.grade !== undefined) params.set('grade', String(context.grade))
  if (context.classNumber !== undefined) params.set('class', String(context.classNumber))
  if (context.self) params.set('self', '1')
  return `/submit?${params.toString()}`
}
