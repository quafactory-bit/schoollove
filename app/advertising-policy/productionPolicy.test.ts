import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('PHASE 10D Production policy hotfix', () => {
  it('광고 정책은 실제 시행일과 현재 Production 경계를 안내한다', () => {
    const source = readFileSync(join(process.cwd(), 'app/advertising-policy/page.tsx'), 'utf8')

    expect(source).toContain('시행일: 2026년 7월 28일')
    expect(source).toContain('현재 Production 구현과 운영 경계')
    expect(source).not.toContain('시행 예정일')
    expect(source).not.toContain('Production 적용 전')
  })

  it('관리자 로그인은 검색 엔진과 캐시에서 제외한다', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/login/layout.tsx'), 'utf8')

    expect(source).toContain('robots: { index: false, follow: false, nocache: true, noarchive: true }')
  })
})
