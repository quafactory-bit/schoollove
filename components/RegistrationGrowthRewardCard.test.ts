import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'RegistrationGrowthRewardCard.tsx'), 'utf-8')

describe('RegistrationGrowthRewardCard — retro growth result UI contract', () => {
  it('keeps the large success headline black and avoids blue card styling', () => {
    expect(SOURCE).toContain('font-retro text-lg')
    expect(SOURCE).toContain('text-schoollove-text')
    expect(SOURCE).not.toMatch(/border-blue|bg-blue|text-blue/)
  })

  it('uses a small HUD-style progress bar without changing the growth calculation contract', () => {
    expect(SOURCE).toContain('role="progressbar"')
    expect(SOURCE).toContain('bg-schoollove-progress-track')
    expect(SOURCE).toContain('bg-schoollove-electric-blue')
    expect(SOURCE).toContain('snapshot?.progressPercent ?? copy.progressBar?.percent ?? 0')
  })

  it('renders server-sourced current count, level, remaining people and progress', () => {
    expect(SOURCE).toContain('reward?.after')
    expect(SOURCE).toContain('snapshot?.visibleProfileCount')
    expect(SOURCE).toContain('snapshot?.effectiveLevel')
    expect(SOURCE).toContain('snapshot.remainingToNext')
    expect(SOURCE).toContain('snapshot?.progressPercent')
    expect(SOURCE).toContain('visibleProfileCount != null')
    expect(SOURCE).not.toContain('visibleProfileCount ?? 0')
  })
})
