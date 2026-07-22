import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(join(__dirname, 'TabBar.tsx'), 'utf8')
const LAYOUT_SOURCE = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8')

describe('TabBar responsive navigation contract', () => {
  it('hides the fixed mobile navigation at the desktop breakpoint', () => {
    expect(SOURCE).toContain('fixed inset-x-0 bottom-0')
    expect(SOURCE).toContain('lg:hidden')
  })

  it('keeps the navigation attached to the viewport bottom with safe-area padding', () => {
    expect(SOURCE).toContain("paddingBottom: 'env(safe-area-inset-bottom)'")
  })

  it('keeps page content clear of the fixed mobile navigation', () => {
    expect(LAYOUT_SOURCE).toContain('className="pb-16"')
  })
})
