import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'SchoolGrowthPanel.tsx'), 'utf-8')

describe('SchoolGrowthPanel — retro growth HUD contract', () => {
  it('keeps school title black while level and growth badges use the small retro HUD style', () => {
    expect(SOURCE).toContain('text-xl font-black text-gray-900')
    expect(SOURCE).toContain('font-retro inline-flex')
    expect(SOURCE).toContain('text-schoollove-level')
    expect(SOURCE).toContain('bg-schoollove-neon-mint')
  })

  it('preserves the existing people-growth calculation and uses the electric-blue progress token', () => {
    expect(SOURCE).toContain('calculatePeopleGrowthStage(snapshot.schoolState, snapshot.visibleProfileCount)')
    expect(SOURCE).toContain('style={{ width: `${peopleGrowth.progressPercent}%` }}')
    expect(SOURCE).toContain('bg-schoollove-electric-blue')
    expect(SOURCE).not.toMatch(/bg-blue|text-blue|border-blue|indigo/)
  })
})
