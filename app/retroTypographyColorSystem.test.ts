import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf-8')
const LAYOUT = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf-8')
const TAILWIND = readFileSync(join(ROOT, 'tailwind.config.ts'), 'utf-8')

describe('single SchoolLove Classic RPG typography system', () => {
  it('ships the approved self-hosted webfont and required notices without a public TTF', () => {
    const fontDir = join(ROOT, 'public', 'fonts', 'schoollove-classic-rpg')
    const woff2Path = join(fontDir, 'SchoolLoveClassicRPG-Regular.woff2')

    expect(existsSync(woff2Path)).toBe(true)
    expect(existsSync(join(fontDir, 'LICENSE.txt'))).toBe(true)
    expect(existsSync(join(fontDir, 'THIRD_PARTY_NOTICES.md'))).toBe(true)
    expect(existsSync(join(fontDir, 'SchoolLoveClassicRPG-Regular.ttf'))).toBe(false)
    expect(statSync(woff2Path).size).toBeGreaterThan(0)
  })

  it('defines one local face and applies it to document text and native controls', () => {
    expect(GLOBALS).toContain('font-family: "SchoolLove Classic RPG"')
    expect(GLOBALS).toContain('/fonts/schoollove-classic-rpg/SchoolLoveClassicRPG-Regular.woff2')
    expect(GLOBALS).toContain('font-weight: 500')
    expect(GLOBALS).toContain('font-display: swap')
    expect(GLOBALS).toContain('font-synthesis: none')

    for (const selector of ['html', 'body,', 'button,', 'input,', 'textarea,', 'select,', 'option,', 'h1,', 'a,', 'label,', 'table,', 'dialog,']) {
      expect(GLOBALS).toContain(selector)
    }
  })

  it('keeps all Tailwind font-family aliases on the same global variable', () => {
    expect(TAILWIND).toContain('fontFamily')
    for (const alias of ['sans', 'mono', 'status', 'retro', 'game']) {
      expect(TAILWIND).toContain(`${alias}: ['var(--font-schoollove)']`)
    }
  })

  it('removes alternate display font loading from the root layout', () => {
    expect(LAYOUT).not.toMatch(/next\/font|Geist|NeoDunggeunmo|cdn\.jsdelivr|pretendard\.min\.css|dangerouslySetInnerHTML/)
    expect(GLOBALS).not.toContain('NeoDunggeunmo')
    expect(GLOBALS).not.toContain('--font-geist')
  })

  it('retains the established neutral and restrained accent color tokens', () => {
    for (const color of ['#111111', '#111827', '#5b5b5b', '#8a8a8a', '#e8e8e8', '#f7f7f7', '#32e6b7', '#b7f84a', '#4f7cff', '#ff9f43']) {
      expect(GLOBALS).toContain(color)
    }
  })
})
