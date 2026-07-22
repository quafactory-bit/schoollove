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

  it('상태·학교·성장 문장을 의미별 색상과 굵기로 나눈다', () => {
    expect(SOURCE).toContain('text-schoollove-system')
    expect(SOURCE).toContain('text-schoollove-school')
    expect(SOURCE).toContain('text-schoollove-growth')
  })

  it('피드 링크에 aria-label과 최소 터치 높이가 있다', () => {
    expect(SOURCE).toContain('aria-label=')
    expect(SOURCE).toContain('min-h-11')
  })
})
