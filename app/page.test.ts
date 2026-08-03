import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('PHASE 10A safe home', () => {
  it('프로필 기반 피드와 사람 등록 순위를 조회하지 않는다', () => {
    expect(SOURCE).not.toMatch(/getRecentRegisterActivity|getRecentTraceActivity|getCurrentSchoolRanking|HomeActivityFeed|CurrentSchoolRanking/)
  })

  it('초등·중등을 포함한 사람 등록 경쟁과 등록 CTA를 노출하지 않는다', () => {
    expect(SOURCE).not.toMatch(/현재 학교 순위|다음 성장 단계|내 이름 남기기|친구 등록|LEVEL UP/)
    expect(SOURCE).toContain('공개 개인 명단·사람 이름 검색·Instagram 노출 없이')
  })

  it('학교 검색과 삭제·비공개 문의 경로를 유지한다', () => {
    expect(SOURCE).toContain('href="/search"')
    expect(SOURCE).toContain('href="/contact"')
  })
})
