import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'CurrentSchoolRanking.tsx'), 'utf8')

describe('CurrentSchoolRanking 홈 순위 UI 계약', () => {
  it('현재 학교 순위 제목과 빈 상태를 표시하고 과거 주간 제목은 쓰지 않는다', () => {
    expect(SOURCE).toContain('현재 학교 순위')
    expect(SOURCE).toContain('아직 순위에 오른 학교가 없어요.')
    expect(SOURCE).not.toContain('이번 주 학교 순위')
  })

  it('학교 행 전체가 School Hub 링크이고 접근 가능한 설명을 가진다', () => {
    expect(SOURCE).toContain('href={`/school/${row.slug}`}')
    expect(SOURCE).toContain('aria-label={aria}')
    expect(SOURCE).toContain('공개 등록')
  })

  it('마지막 행의 중복 구분선을 제거하고 의미 색상과 진행률을 사용한다', () => {
    expect(SOURCE).toContain('last:border-b-0')
    expect(SOURCE).toContain('text-schoollove-school')
    expect(SOURCE).toContain('row.progressPercent')
    expect(SOURCE).not.toMatch(/[▲▼]/)
  })

  it('작은 랭킹 HUD에는 레트로 폰트와 제한된 형광 포인트를 적용한다', () => {
    expect(SOURCE).toContain('font-retro text-[11px]')
    expect(SOURCE).toContain('font-retro pt-0.5')
    expect(SOURCE).toContain('text-schoollove-electric-blue')
    expect(SOURCE).toContain('bg-schoollove-electric-blue')
    expect(SOURCE).toContain('bg-schoollove-neon-lime')
  })
})
