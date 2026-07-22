import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'HomeActivityItem.tsx'), 'utf8')

describe('HomeActivityItem 구분선 피드 계약', () => {
  it('외곽 카드 없이 항목 구분선이 이어지고 마지막 구분선은 제거된다', () => {
    expect(SOURCE).toContain('border-b border-schoollove-border')
    expect(SOURCE).toContain('last:border-b-0')
    expect(SOURCE).not.toContain('shadow')
  })

  it('본문 문장은 검정 중심으로 유지하고 작은 상태 HUD에만 레트로 포인트를 쓴다', () => {
    expect(SOURCE).toContain('font-retro text-[10px]')
    expect(SOURCE).toContain('text-schoollove-neon-orange')
    expect(SOURCE).toContain('text-schoollove-electric-blue')
    expect(SOURCE).toContain('text-schoollove-school')
    expect(SOURCE).not.toContain('text-schoollove-growth">{action}</span>')
  })

  it('피드 링크에 aria-label과 최소 터치 높이가 있다', () => {
    expect(SOURCE).toContain('aria-label=')
    expect(SOURCE).toContain('min-h-11')
  })
})
