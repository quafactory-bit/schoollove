import { describe, expect, it } from 'vitest'
import {
  buildSubmitContextHref,
  gradeForSchoolType,
  parseSubmitPrefill,
} from './prefill'

function params(value: string): URLSearchParams {
  return new URLSearchParams(value)
}

describe('parseSubmitPrefill', () => {
  it('유효한 school/year/grade/class/self context를 반환한다', () => {
    expect(parseSubmitPrefill(params('school=test-high&year=2020&grade=3&class=2&self=1'))).toEqual({
      schoolSlug: 'test-high',
      graduationYear: '2020',
      grade: '3',
      classNumber: '2',
      selfMode: true,
    })
  })

  it('일부 query만 있으면 나머지는 안전한 기본값을 사용한다', () => {
    expect(parseSubmitPrefill(params('school=test-high&year=2021'))).toEqual({
      schoolSlug: 'test-high',
      graduationYear: '2021',
      grade: '',
      classNumber: '',
      selfMode: false,
    })
  })

  it('빈 값·숫자가 아닌 값·허용 연도와 학년 밖의 값은 무시한다', () => {
    expect(parseSubmitPrefill(params('school=%20&year=2033&grade=7&class=NaN'))).toEqual({
      schoolSlug: null,
      graduationYear: '',
      grade: '',
      classNumber: '',
      selfMode: false,
    })
  })

  it('0·음수·안전하지 않은 정수는 숫자 context로 허용하지 않는다', () => {
    expect(parseSubmitPrefill(params('year=-1&grade=0&class=999999999999999999999'))).toMatchObject({
      graduationYear: '',
      grade: '',
      classNumber: '',
    })
  })

  it('기존 self 계약은 정확히 self=1일 때만 유지한다', () => {
    expect(parseSubmitPrefill(params('self=1')).selfMode).toBe(true)
    expect(parseSubmitPrefill(params('self=true')).selfMode).toBe(false)
  })
})

describe('gradeForSchoolType', () => {
  it('초등학교는 1~6학년, 중·고등학교는 1~3학년만 초기화한다', () => {
    expect(gradeForSchoolType('6', 'elementary')).toBe('6')
    expect(gradeForSchoolType('4', 'middle')).toBe('')
    expect(gradeForSchoolType('3', 'high')).toBe('3')
  })

  it('대학교·전문대학에는 학년·반 prefill을 적용하지 않는다', () => {
    expect(gradeForSchoolType('2', 'university')).toBe('')
    expect(gradeForSchoolType('2', 'college')).toBe('')
  })
})

describe('buildSubmitContextHref', () => {
  it('Year context를 URLSearchParams로 인코딩한다', () => {
    expect(buildSubmitContextHref({ school: '테스트 고등학교', year: 2020 })).toBe(
      '/submit?school=%ED%85%8C%EC%8A%A4%ED%8A%B8+%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&year=2020'
    )
  })

  it('Class context와 기존 self 계약을 모두 보존한다', () => {
    expect(
      buildSubmitContextHref({ school: 'test-high', year: 2020, grade: 3, classNumber: 2, self: true })
    ).toBe('/submit?school=test-high&year=2020&grade=3&class=2&self=1')
  })
})
