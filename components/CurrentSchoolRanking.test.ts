import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'CurrentSchoolRanking.tsx'), 'utf8')

describe('CurrentSchoolRanking presentation contract', () => {
  it('keeps the current-ranking and empty-state presentation branches', () => {
    expect(SOURCE).toContain("status === 'error'")
    expect(SOURCE).toContain('rows.length === 0')
    expect(SOURCE).toContain('href="/search"')
  })

  it('keeps ranking rows as accessible school links with progress information', () => {
    expect(SOURCE).toContain('href={`/school/${row.slug}`}')
    expect(SOURCE).toContain('aria-label={aria}')
    expect(SOURCE).toContain('row.progressPercent')
    expect(SOURCE).toContain('last:border-b-0')
  })

  it('uses visual hierarchy without a component-local font override', () => {
    expect(SOURCE).not.toContain('font-game')
    expect(SOURCE).toContain('text-[12px] tracking-[0.14em] text-schoollove-hud-red')
    expect(SOURCE).toContain('pt-0.5 text-[22px]')
    expect(SOURCE).toContain('break-keep text-[17px] leading-6')
    expect(SOURCE).toContain('rounded-sm bg-schoollove-level/10')
    expect(SOURCE).toContain('bg-schoollove-electric-blue')
  })

  it('retains progress, completion, and divider contracts', () => {
    expect(SOURCE).toContain('Math.round(row.progressPercent)')
    expect(SOURCE).toContain('bg-schoollove-neon-lime')
    expect(SOURCE).toContain('text-schoollove-text group-hover:underline')
  })
})
