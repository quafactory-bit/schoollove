import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('Year route emergency privacy boundary', () => {
  it('개인 행·사람 검색을 조회하거나 렌더하지 않는다 (v2-04: 숫자 집계와 이름 없는 자리만)', () => {
    expect(SOURCE).not.toMatch(/getAllProfilesBySchoolYear|getYearProfileCount|YearPeopleSearch|ProfileCard|instagram|nickname|display_name|getSchoolRoster/)
    expect(SOURCE).toContain('getSchoolYearCounts(school.id)')
    expect(SOURCE).toContain('parseGraduationYearParam(yearParam)')
  })

  it('noindex/nofollow/noarchive 공통 정책을 사용한다', () => {
    expect(SOURCE).toContain("robots: getPublicRouteRobots('year')")
  })
})
