import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf-8')
const LAYOUT = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf-8')
const TAILWIND = readFileSync(join(ROOT, 'tailwind.config.ts'), 'utf-8')

describe('retro typography/color system', () => {
  it('uses a self-hosted NeoDunggeunmo font with a bundled OFL license', () => {
    const fontPath = join(ROOT, 'public', 'fonts', 'neodgm', 'neodgm.woff2')
    const licensePath = join(ROOT, 'public', 'fonts', 'neodgm', 'LICENSE.txt')

    expect(existsSync(fontPath)).toBe(true)
    expect(existsSync(licensePath)).toBe(true)
    expect(statSync(fontPath).size).toBeGreaterThan(0)
    expect(GLOBALS).toContain('@font-face')
    expect(GLOBALS).toContain('/fonts/neodgm/neodgm.woff2')
  })

  it('does not depend on an external runtime font CDN in the root layout', () => {
    expect(LAYOUT).not.toMatch(/cdn\.jsdelivr|pretendard\.min\.css|dangerouslySetInnerHTML/)
  })

  it('defines the approved black, gray, and neon tokens', () => {
    for (const color of ['#111111', '#111827', '#5b5b5b', '#8a8a8a', '#e8e8e8', '#f7f7f7']) {
      expect(GLOBALS).toContain(color)
    }

    for (const color of ['#32e6b7', '#b7f84a', '#4f7cff', '#ff9f43']) {
      expect(GLOBALS).toContain(color)
    }
  })

  it('exposes body and retro fallback font stacks through Tailwind', () => {
    expect(TAILWIND).toContain("sans: ['var(--font-geist)'")
    expect(TAILWIND).toContain('fontFamily')
    expect(TAILWIND).toContain('retro')
    expect(TAILWIND).toContain('var(--font-schoollove-retro)')
  })
})
