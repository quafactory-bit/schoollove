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
    expect(SOURCE).toContain('<PrivacyTransitionNotice')
  })

  it('개인 데이터가 제거된 학교 기본 페이지는 색인을 유지한다', () => {
    expect(SOURCE).toContain("robots: getPublicRouteRobots('school')")
  })

  it('membership과 무관한 일반 내 계정 CTA만 제공한다', () => {
    expect(SOURCE).toContain('href="/account"')
    expect(SOURCE).toContain('내 계정에서 관리하기')
    expect(SOURCE).not.toMatch(/getAccountState|profile_school_memberships|owner_user_id/)
  })
})
