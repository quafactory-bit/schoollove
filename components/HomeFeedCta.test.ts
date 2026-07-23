import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'HomeFeedCta.tsx'), 'utf8')

describe('HomeFeedCta global typography contract', () => {
  it('keeps its contextual CTA touch target without a local font override', () => {
    expect(SOURCE).toContain('min-h-12 min-w-[160px]')
    expect(SOURCE).toContain('text-[15px] text-schoollove-text')
    expect(SOURCE).toContain('text-[16px] font-semibold leading-relaxed text-schoollove-text')
    expect(SOURCE).not.toContain('font-game')
  })
})
