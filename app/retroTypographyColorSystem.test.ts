import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf-8')
const LAYOUT = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf-8')
const TAILWIND = readFileSync(join(ROOT, 'tailwind.config.ts'), 'utf-8')
const HOME = readFileSync(join(ROOT, 'app', 'page.tsx'), 'utf-8')
const NOT_FOUND = readFileSync(join(ROOT, 'app', 'not-found.tsx'), 'utf-8')
const SUBMIT = readFileSync(join(ROOT, 'app', 'submit', 'page.tsx'), 'utf-8')
const FOOTER = readFileSync(join(ROOT, 'components', 'Footer.tsx'), 'utf-8')
const SCHOOL_WARMTH = readFileSync(join(ROOT, 'components', 'SchoolWarmth.tsx'), 'utf-8')
const PROFILE_CARD = readFileSync(join(ROOT, 'components', 'ProfileCard.tsx'), 'utf-8')

describe('sitewide DNF BitBit v2 typography and text color system', () => {
  it('ships the approved official OpenType font and required notices', () => {
    const fontDir = join(ROOT, 'public', 'fonts', 'dnf-bitbit-v2')
    const otfPath = join(fontDir, 'DNFBitBitv2.otf')

    expect(existsSync(otfPath)).toBe(true)
    expect(existsSync(join(fontDir, 'LICENSE.txt'))).toBe(true)
    expect(existsSync(join(fontDir, 'THIRD_PARTY_NOTICES.md'))).toBe(true)
    expect(existsSync(join(ROOT, 'public', 'fonts', 'schoollove-classic-rpg', 'SchoolLoveClassicRPG-Regular.woff2'))).toBe(false)
    expect(statSync(otfPath).size).toBe(1836812)
  })

  it('defines one local face and applies it to document text and native controls', () => {
    expect(GLOBALS).toContain('font-family: "DNFBitBitv2"')
    expect(GLOBALS).toContain('/fonts/dnf-bitbit-v2/DNFBitBitv2.otf')
    expect(GLOBALS).toContain('format("opentype")')
    expect(GLOBALS).toContain('font-weight: 400')
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
    expect(GLOBALS).not.toContain('SchoolLove Classic RPG')
    expect(GLOBALS).not.toContain('--font-geist')
  })

  it('uses the approved text color tokens without changing non-text accent tokens', () => {
    for (const color of ['#000000', '#4b5563', '#c62828']) {
      expect(GLOBALS).toContain(color)
    }
    for (const color of ['#e8e8e8', '#f7f7f7', '#32e6b7', '#b7f84a', '#4f7cff', '#ff9f43']) {
      expect(GLOBALS).toContain(color)
    }
  })

  it('keeps black as the default text while explicitly preserving white text on dark actions', () => {
    expect(GLOBALS).toContain('body .btn-primary,')
    expect(GLOBALS).toContain('body .chip-active,')
    expect(GLOBALS).toContain('body .schoollove-dark-action,')
    expect(GLOBALS).toContain('color: #ffffff !important')
    expect(HOME).toContain('schoollove-dark-action schoollove-focus')
    expect(NOT_FOUND).toContain('className="btn-primary')
    expect(GLOBALS).toContain('body .schoollove-dark-action-hover:hover')
  })

  it('keeps the shared footer copyright and policy links on the general black text token', () => {
    expect(FOOTER).toContain('© 2026 스쿨러브아이. All rights reserved.')
    expect(FOOTER).toContain('mt-4 text-center text-xs text-schoollove-text')
    expect(FOOTER).not.toMatch(/text-neutral-(400|500)/)
  })

  it('forces enabled native input and textarea placeholders to opaque black', () => {
    expect(GLOBALS).toContain('body input:not(:disabled)::placeholder')
    expect(GLOBALS).toContain('body textarea:not(:disabled)::placeholder')
    expect(GLOBALS).toContain('color: var(--schoollove-text) !important')
    expect(GLOBALS).toContain('opacity: 1 !important')
  })

  it('keeps school trace suggestions and profile avatar initials black', () => {
    expect(SCHOOL_WARMTH).toContain('text-sm text-schoollove-text bg-gray-50')
    expect(SCHOOL_WARMTH).not.toContain('text-sm text-gray-700 bg-gray-50')
    expect(PROFILE_CARD).toContain('justify-center text-schoollove-text font-bold text-sm')
    expect(PROFILE_CARD).not.toContain('justify-center text-gray-700 font-bold text-sm')
  })

  it('keeps the mobile registration title readable without clipping or width transforms', () => {
    const title = SUBMIT.match(/<h1 className="[^"]*\[text-wrap:balance\][^"]*">[\s\S]*?<\/h1>/)?.[0] ?? ''
    expect(title).toContain('max-w-[280px]')
    expect(title).toContain('text-[22px]')
    expect(title).toContain('[text-wrap:balance]')
    expect(title).toContain('block whitespace-nowrap">기억나는 친구 이름을')
    expect(title).toContain('block whitespace-nowrap">남겨보세요')
    expect(title).not.toMatch(/overflow-hidden|truncate|scale-|transform/)
  })
})
