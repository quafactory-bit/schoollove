import type { SchoolType } from '@/types/school'

export type GradeClassInput = {
  grade_number: number
  class_number: number
}

const GRADE_LIMITS: Partial<Record<SchoolType, number>> = {
  elementary: 6,
  middle: 3,
  high: 3,
}

export function gradeNumbersForSchoolType(schoolType: SchoolType | null): number[] {
  const limit = schoolType ? GRADE_LIMITS[schoolType] ?? 0 : 0
  return Array.from({ length: limit }, (_unused, index) => index + 1)
}

export function buildGradeClassPayload(values: Record<number, string>): GradeClassInput[] {
  return Object.entries(values)
    .filter(([, value]) => value.trim().length > 0)
    .map(([grade, classNumber]) => ({
      grade_number: Number(grade),
      class_number: Number(classNumber),
    }))
    .sort((left, right) => left.grade_number - right.grade_number)
}

export function formatGradeClassHistory(rows: GradeClassInput[]): string {
  return [...rows]
    .sort((left, right) => left.grade_number - right.grade_number)
    .map((row) => `${row.grade_number}학년 ${row.class_number}반`)
    .join(' · ')
}
