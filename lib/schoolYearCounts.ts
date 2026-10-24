import { supabase } from '@/lib/supabase'

// v2-04: 학교·졸업연도별 등록 수(명단 표시를 켠 회원). 개인 식별 정보 없이 숫자만 다룬다.
export type SchoolYearCount = { graduationYear: number; count: number }
export type SchoolYearCounts = { status: 'ok' | 'unavailable'; years: SchoolYearCount[]; total: number }

export function normalizeSchoolYearCounts(rows: unknown): SchoolYearCount[] {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => ({ graduationYear: Number((row as { graduation_year?: unknown }).graduation_year), count: Number((row as { count?: unknown }).count) }))
    .filter((row) => Number.isInteger(row.graduationYear) && Number.isInteger(row.count) && row.count >= 1)
    .sort((a, b) => b.graduationYear - a.graduationYear)
}

export async function getSchoolYearCounts(schoolId: string): Promise<SchoolYearCounts> {
  try {
    const { data, error } = await supabase.rpc('school_year_counts_v2', { p_school_id: schoolId })
    if (error) return { status: 'unavailable', years: [], total: 0 }
    const years = normalizeSchoolYearCounts(data)
    return { status: 'ok', years, total: years.reduce((sum, row) => sum + row.count, 0) }
  } catch {
    return { status: 'unavailable', years: [], total: 0 }
  }
}

export function parseGraduationYearParam(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null
  const year = Number(value)
  return year >= 1950 && year <= 2100 ? year : null
}
