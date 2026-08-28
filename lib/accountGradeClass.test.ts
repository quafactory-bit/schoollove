import { describe, expect, it } from 'vitest'
import {
  buildGradeClassPayload,
  formatGradeClassHistory,
  gradeNumbersForSchoolType,
} from './accountGradeClass'

describe('grade/class history account contract', () => {
  it('학교 유형별 허용 학년만 만든다', () => {
    expect(gradeNumbersForSchoolType('elementary')).toEqual([1, 2, 3, 4, 5, 6])
    expect(gradeNumbersForSchoolType('middle')).toEqual([1, 2, 3])
    expect(gradeNumbersForSchoolType('high')).toEqual([1, 2, 3])
    expect(gradeNumbersForSchoolType('university')).toEqual([])
    expect(gradeNumbersForSchoolType('college')).toEqual([])
  })

  it('기억나는 반만 학년 오름차순 payload로 만든다', () => {
    expect(buildGradeClassPayload({ 3: '2', 1: '2', 2: '5', 4: '' })).toEqual([
      { grade_number: 1, class_number: 2 },
      { grade_number: 2, class_number: 5 },
      { grade_number: 3, class_number: 2 },
    ])
  })

  it('학년별 반을 오해 없는 한 줄로 표시한다', () => {
    expect(formatGradeClassHistory([
      { grade_number: 3, class_number: 2 },
      { grade_number: 1, class_number: 2 },
      { grade_number: 2, class_number: 5 },
    ])).toBe('1학년 2반 · 2학년 5반 · 3학년 2반')
  })
})
