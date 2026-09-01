import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SchoolMembership } from '@/lib/account'
import { buildMySchoolCards } from '@/lib/accountFirstValue'

const SOURCE = readFileSync(join(__dirname, 'MySchoolsPanel.tsx'), 'utf8')

function membership(overrides: Partial<SchoolMembership> = {}): SchoolMembership {
  return {
    id: 'private-membership-id',
    school_id: 'private-school-id',
    graduation_year: 2020,
    class_number: 3,
    class_history: [
      { grade_number: 1, class_number: 2 },
      { grade_number: 2, class_number: 5 },
      { grade_number: 3, class_number: 2 },
    ],
    school: {
      id: 'private-school-id',
      school_name: '테스트고등학교',
      school_type: 'high',
      sido: '서울특별시',
      sigungu: '종로구',
      slug: 'test-school',
    },
    ...overrides,
  }
}

describe('MySchoolsPanel privacy-safe share action', () => {
  it('유효한 내 학교 card에 공개 학교 보기와 공유 action을 함께 연결한다', () => {
    expect(buildMySchoolCards([membership()])[0].href).toBe('/school/test-school')
    expect(SOURCE).toContain('<Link href={school.href}')
    expect(SOURCE).toContain('<ShareButton')
    expect(SOURCE).toContain('schoolName={school.schoolName}')
    expect(SOURCE).toContain('url={school.href}')
    expect(SOURCE).toContain('학교 페이지 보기')
    expect(SOURCE).toContain('학교 링크 공유')
  })

  it('zero state는 학교 등록 안내만 제공하고 share 조건 밖에 머문다', () => {
    expect(buildMySchoolCards([])).toEqual([])
    expect(SOURCE).toContain('if (memberships.length === 0)')
    expect(SOURCE.indexOf('if (memberships.length === 0)')).toBeLessThan(SOURCE.indexOf('학교 링크 공유'))
  })

  it('null school relation에는 share href를 만들지 않는다', () => {
    expect(buildMySchoolCards([membership({ school: null })])[0].href).toBeNull()
    expect(SOURCE).toContain('{school.href ? <div')
  })

  it('malformed slug에는 link와 share action을 모두 fail closed한다', () => {
    const school = { ...membership().school!, slug: 'test/school' }
    expect(buildMySchoolCards([membership({ school })])[0].href).toBeNull()
  })

  it('재로그인 return loop는 타인 활동을 약속하지 않고 DB 학교 이력만 안내한다', () => {
    expect(SOURCE).toContain('다시 로그인하면 등록한 학교 이력을 내 계정에서 계속 확인할 수 있습니다.')
    expect(SOURCE).not.toMatch(/친구가 기다리고|동창이 있어요|명이 참여|성장 중/)
  })

  it('legacy 단일 반을 표시하지 않고 학년별 반 이력을 정확히 표시한다', () => {
    expect(SOURCE).toContain('formatGradeClassHistory(school.classHistory)')
    expect(SOURCE).not.toContain('school.classNumber')
  })
})
