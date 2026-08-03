import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'app/account/page.tsx'), 'utf8')
const client = readFileSync(join(process.cwd(), 'app/account/AccountClient.tsx'), 'utf8')

describe('/account private management UI', () => {
  it('서버가 검증된 auth context 없이는 login으로 보낸다', () => {
    expect(page).toContain('getAuthenticatedServerContext()')
    expect(page).toContain("if (!auth) redirect('/login?next=/account')")
    expect(page).toContain("robots: { index: false, follow: false, nocache: true, noarchive: true }")
  })

  it('성인 확인, 필수 동의, 내 프로필, 학교 이력, 삭제·탈퇴를 제공한다', () => {
    for (const text of ['만 19세 이상 확인', '필수 동의', '내 비공개 프로필', '내 학교 이력', '내 프로필 삭제', '계정 탈퇴 요청']) {
      expect(client).toContain(text)
    }
  })

  it('생년월일 비저장과 기본 비공개를 명시한다', () => {
    expect(client).toContain('원본 생년월일은 DB나 로그에 저장하지 않습니다')
    expect(client).toContain('사람 검색이나 공개 화면에 표시되지 않습니다')
  })

  it('제한 베타·연결·메시지 CTA를 공개 계정 화면에서 제거한다',()=>{
    for(const path of ['/people/search','/connections','/notifications','/account/safety'])expect(client).not.toContain(path)
    expect(client).not.toContain('제한 베타 시작 상태')
  })

  it('실제 계정 상태에서 로그인 포함 온보딩 진행률을 계산한다',()=>{
    expect(client).toContain('onboardingCompleted=1+Number(state.adultEligible)')
    expect(client).toContain('온보딩 진행 상태 보기')
    expect(client).toContain('{onboardingCompleted*20}%')
  })

})
