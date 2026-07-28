import { describe, expect, it } from 'vitest'
import { isClassPageIndexable, isSchoolPageIndexable, isYearPageIndexable } from './seoIndexing'

describe('PHASE 10A indexing boundary', () => {
  it('개인 데이터가 제거된 학교 기본 페이지는 색인 가능하다', () => {
    expect(isSchoolPageIndexable()).toBe(true)
  })

  it('과거 profile count와 무관하게 year/class는 항상 noindex다', () => {
    expect(isYearPageIndexable()).toBe(false)
    expect(isClassPageIndexable()).toBe(false)
  })
})
