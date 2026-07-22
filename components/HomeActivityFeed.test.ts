import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'HomeActivityFeed.tsx'), 'utf8')

describe('HomeActivityFeed desktop hierarchy contract', () => {
  it('keeps the server-provided feed data but initially exposes only the first 8 items', () => {
    expect(SOURCE).toContain('HOME_ACTIVITY_INITIAL_VISIBLE_COUNT = 8')
    expect(SOURCE).toContain('items.slice(0, HOME_ACTIVITY_INITIAL_VISIBLE_COUNT)')
    expect(SOURCE).toContain('items.slice(HOME_ACTIVITY_INITIAL_VISIBLE_COUNT)')
  })

  it('uses a disclosure instead of changing fetch limits or activity policy', () => {
    expect(SOURCE).toContain('<details')
    expect(SOURCE).toContain('<summary')
    expect(SOURCE).toContain('성장 소식 더 보기')
    expect(SOURCE).not.toContain('HOME_ACTIVITY_FEED_LIMIT')
  })
})
