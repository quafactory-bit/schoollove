import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'HomeActivityItem.tsx'), 'utf8')

describe('HomeActivityItem presentation contract', () => {
  it('uses a divided continuous feed row rather than a repeated card', () => {
    expect(SOURCE).toContain('border-b border-schoollove-border')
    expect(SOURCE).toContain('last:border-b-0')
    expect(SOURCE).not.toContain('shadow')
  })

  it('keeps body and metadata hierarchy without a local font override', () => {
    expect(SOURCE).not.toContain('font-game')
    expect(SOURCE).toContain('text-[11px] tracking-[0.1em]')
    expect(SOURCE).toContain('text-schoollove-neon-orange')
    expect(SOURCE).toContain('text-schoollove-electric-blue')
    expect(SOURCE).toContain('break-keep text-[15px] leading-7 text-schoollove-text')
  })

  it('retains its accessible school link and touch target', () => {
    expect(SOURCE).toContain('aria-label=')
    expect(SOURCE).toContain('min-h-11')
    expect(SOURCE).toContain('h-9 w-9')
  })
})
