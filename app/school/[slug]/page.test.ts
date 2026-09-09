import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('public School Hub privacy boundary', () => {
  it('학교 기본 정보만 조회하고 공개 프로필 행을 조회하지 않는다', () => {
    expect(SOURCE).toContain('getSchoolBySlug')
    expect(SOURCE).not.toMatch(/getProfiles|getGraduationYears|getSchoolProfileCount|getTotalProfileCount/)
  })

  it('ProfileCard, Instagram, 졸업연도·반 명단을 렌더하지 않는다', () => {
    expect(SOURCE).not.toMatch(/ProfileCard|instagram|졸업년도별|yearFilter|class_number/)
    expect(SOURCE).toContain('개인 이름·졸업연도·학년·반은 공개 명단으로 표시하지 않아요.')
  })

  it('개인 데이터가 제거된 학교 기본 페이지는 색인을 유지한다', () => {
    expect(SOURCE).toContain("robots: getPublicRouteRobots('school')")
  })

  it('owner-only membership으로 CTA만 개인화하고 개인 행을 공개 컴포넌트에 전달하지 않는다', () => {
    expect(SOURCE).toContain('href="/account"')
    expect(SOURCE).toContain(".eq('owner_user_id', auth.user.id)")
    expect(SOURCE).toContain('내 학교로 등록하고 키우기')
    expect(SOURCE).not.toMatch(/getAccountState|display_name|graduation_year/)
    expect(SOURCE).toContain('학교 레벨과 사람 찾기 이용 권한은 별개')
  })
})
