import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'app/account/page.tsx'), 'utf8')
const client = readFileSync(join(process.cwd(), 'app/account/AccountClient.tsx'), 'utf8')

describe('/account private management UI', () => {
  it('서버가 검증된 auth context 없이는 login으로 보낸다', () => {
    expect(page).toContain('getAuthenticatedServerContext()')
    expect(page).toContain("if (!auth) redirect('/login')")
    expect(page).toContain("robots: { index: false, follow: false, nocache: true, noarchive: true }")
  })

  it('성인 확인, 필수 동의, 내 프로필, 학교 이력, 삭제·탈퇴를 제공한다', () => {
    for (const text of ['만 19세 이상 확인', '필수 동의', '내 비공개 프로필', '내 학교 이력', '내 프로필 삭제', '계정 탈퇴 요청']) {
      expect(client).toContain(text)
    }
  })

  it('생년월일 비저장과 기본 비공개를 명시한다', () => {
    expect(client).toContain('원본 생년월일은 DB에 저장하지 않습니다')
    expect(client).toContain('다른 로그인 사용자와 공개 학교 페이지에는 표시되지 않습니다')
    expect(client).not.toContain('사람 검색')
  })
})
