import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SchoolMembership } from '@/lib/account'
import { buildMySchoolCards, buildSafeMySchoolHref } from './accountFirstValue'

const COMPONENT_SOURCE = readFileSync(join(process.cwd(), 'components/account/MySchoolsPanel.tsx'), 'utf8')

function membership(overrides: Partial<SchoolMembership> = {}): SchoolMembership {
  return {
    id: 'membership-1',
    school_id: 'school-1',
    graduation_year: 2020,
    class_number: 3,
    school: {
      id: 'school-1',
      school_name: '테스트고등학교',
      school_type: 'high',
      sido: '서울특별시',
      sigungu: '종로구',
      slug: 'test-school',
    },
    ...overrides,
  }
}

describe('private account first-value my schools', () => {
  it('학교명, 유형, 지역, 졸업연도, 선택 반과 정확한 학교 기본 경로를 만든다', () => {
    expect(buildMySchoolCards([membership()])).toEqual([{
      id: 'membership-1',
      schoolName: '테스트고등학교',
      schoolType: '고등학교',
      region: '서울특별시 종로구',
      graduationYear: 2020,
      classNumber: 3,
      href: '/school/test-school',
    }])
  })

  it('반이 없으면 null을 유지하고 학교 relation이 없으면 값을 추측하지 않는다', () => {
    expect(buildMySchoolCards([membership({ school: null, class_number: null })])).toEqual([{
      id: 'membership-1',
      schoolName: '학교 정보 확인 필요',
      schoolType: null,
      region: null,
      graduationYear: 2020,
      classNumber: null,
      href: null,
    }])
  })

  it.each([null, undefined, '', ' test-school', 'test-school ', 'test/school', 'test.school', 'test?school', '학교'])('변형되거나 잘못된 slug %s에는 링크를 만들지 않는다', (slug) => {
    expect(buildSafeMySchoolHref(slug)).toBeNull()
  })

  it('여러 학교는 전달받은 DB 순서를 그대로 보존한다', () => {
    const cards = buildMySchoolCards([
      membership({ id: 'first', school: { ...membership().school!, school_name: '첫 학교' } }),
      membership({ id: 'second', school: { ...membership().school!, school_name: '둘째 학교' } }),
    ])
    expect(cards.map((card) => card.schoolName)).toEqual(['첫 학교', '둘째 학교'])
  })

  it('0건 안내와 비공개 가치 문구를 제공하며 사람·활동·Instagram 가치를 만들지 않는다', () => {
    expect(COMPONENT_SOURCE).toContain('학교 이력을 한 곳 등록하면')
    expect(COMPONENT_SOURCE).toContain('사람 찾기나 공개 명단으로 사용되지 않습니다')
    expect(COMPONENT_SOURCE).not.toMatch(/Instagram|인스타|[0-9]+명|활동량|동문 찾기|사람 발견/)
  })
})
