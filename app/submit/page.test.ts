import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(process.cwd(), 'app', 'submit', 'page.tsx'), 'utf8')

describe('submit maintenance boundary', () => {
  it('등록 폼 대신 성인 본인 인증 전환 안내를 표시한다', () => {
    expect(SOURCE).toContain('신규 개인 등록을 잠시 중단했습니다')
    expect(SOURCE).toContain('만 19세 이상')
    expect(SOURCE).toContain('본인 정보만 등록')
  })

  it('등록 실행 코드와 개인 입력 필드를 렌더하지 않는다', () => {
    expect(SOURCE).not.toMatch(/registerPeople|CaptchaWidget|handleSubmit|nickname|instagram_id|<input|<textarea/)
  })

  it('민감 route 공통 noindex/nofollow/noarchive 정책을 사용한다', () => {
    expect(SOURCE).toContain("robots: getPublicRouteRobots('submit')")
  })

  it('학교 검색과 운영자 문의 경로를 제공한다', () => {
    expect(SOURCE).toContain('href="/search"')
    expect(SOURCE).toContain('href="/contact"')
  })
})
