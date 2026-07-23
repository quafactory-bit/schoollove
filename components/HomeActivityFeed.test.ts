import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'HomeActivityFeed.tsx'), 'utf8')

describe('HomeActivityFeed presentation contract', () => {
  it('keeps the server-provided feed data while initially exposing only eight items', () => {
    expect(SOURCE).toContain('HOME_ACTIVITY_INITIAL_VISIBLE_COUNT = 8')
    expect(SOURCE).toContain('items.slice(0, HOME_ACTIVITY_INITIAL_VISIBLE_COUNT)')
    expect(SOURCE).toContain('items.slice(HOME_ACTIVITY_INITIAL_VISIBLE_COUNT)')
  })

  it('preserves an accessible disclosure in one divided feed surface', () => {
    expect(SOURCE).toContain('<details')
    expect(SOURCE).toContain('<summary')
    expect(SOURCE).toContain('overflow-hidden border border-schoollove-border bg-schoollove-surface')
    expect(SOURCE).toContain('min-h-11')
    expect(SOURCE).toContain('group-open:text-schoollove-electric-blue')
  })

  it('inherits the global font instead of applying a local font override', () => {
    expect(SOURCE).not.toContain('font-game')
    expect(SOURCE).toContain('text-[14px] text-schoollove-text')
  })
})
