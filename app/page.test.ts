import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('PHASE 10A safe home', () => {
  it('프로필 기반 피드와 사람 등록 순위를 조회하지 않는다', () => {
    expect(SOURCE).not.toMatch(/getRecentRegisterActivity|getRecentTraceActivity|getCurrentSchoolRanking|HomeActivityFeed|CurrentSchoolRanking/)
  })

  it('초등·중등을 포함한 사람 등록 경쟁을 만들지 않고 제한된 명단 범위를 설명한다', () => {
    expect(SOURCE).not.toMatch(/현재 학교 순위|다음 성장 단계|내 이름 남기기|친구 등록|LEVEL UP/)
    expect(SOURCE).toContain('학교 명단은 같은 학교에 등록하고 명단 표시를 켠 성인 회원끼리만 확인해요.')
    expect(SOURCE).toContain('별도 참여 신청이나 승인 없이 정확한 사람 찾기를 바로 이용할 수 있어요.')
  })

  it('학교 검색과 삭제·비공개 문의 경로를 유지한다', () => {
    expect(SOURCE).toContain('href="/search"')
    expect(SOURCE).toContain('내 학교 찾기')
    expect(readFileSync(join(__dirname, '../components/SchoolSearchResults.tsx'), 'utf8')).toContain('<SearchBar')
    expect(readFileSync(join(__dirname, '../components/SearchBar.tsx'), 'utf8')).toContain('type="submit"')
    expect(SOURCE).toContain('href="/contact"')
  })

  it('open 상태는 Google-only 계정 시작 권위와 고정 login 경로만 안내한다', () => {
    expect(SOURCE).toContain("launch.state === 'open'")
    expect(SOURCE).toContain('href="/account"')
    expect(SOURCE).toContain('내 학교로 들어가기')
    expect(SOURCE).not.toMatch(/이메일 인증|Email OTP|6자리/)
    expect(SOURCE).not.toContain('/login?next=/onboarding')
  })
})
