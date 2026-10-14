import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('public School Hub and private same-school roster boundary', () => {
  it('학교 기본 정보만 조회하고 공개 프로필 행을 조회하지 않는다', () => {
    expect(SOURCE).toContain('getSchoolBySlug')
    expect(SOURCE).not.toMatch(/getProfiles|getGraduationYears|getSchoolProfileCount|getTotalProfileCount/)
  })

  it('공개 프로필과 Instagram 없이 좁은 학교 명단 projection만 렌더한다', () => {
    expect(SOURCE).not.toMatch(/ProfileCard|instagram_handle|profile_photo|introduction|owner_user_id.*roster/)
    expect(SOURCE).toContain('getSchoolRoster(auth.client, school.id)')
    expect(SOURCE).toContain('entry.display_name')
    expect(SOURCE).toContain('entry.graduation_year')
    expect(SOURCE).toContain('entry.class_history')
  })

  it('개인 데이터가 제거된 학교 기본 페이지는 색인을 유지한다', () => {
    expect(SOURCE).toContain("robots: getPublicRouteRobots('school')")
  })

  it('owner membership과 reciprocal roster RPC로 CTA와 명단을 개인화한다', () => {
    expect(SOURCE).toContain('<SchoolJoinButton slug={school.slug}')
    expect(SOURCE).toContain('href="/account#my-schools-heading"')
    expect(SOURCE).toContain(".eq('owner_user_id', auth.user.id)")
    expect(SOURCE).toContain('내 학교로 등록하고 키우기')
    expect(SOURCE).not.toContain('getAccountState')
    expect(SOURCE).toContain("rosterStatus: 'ok' | 'unavailable' | 'signed_out'")
    expect(SOURCE).toContain('같은 학교에 등록하고 명단 표시를 켠 만 19세 이상 회원에게만 보입니다')
    expect(SOURCE).toContain('별도 참여 신청이나 운영자 승인 없이 정확한 사람 찾기')
  })
})
