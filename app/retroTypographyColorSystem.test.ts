import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf-8')
const LAYOUT = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf-8')
const TAILWIND = readFileSync(join(ROOT, 'tailwind.config.ts'), 'utf-8')
const HOME = readFileSync(join(ROOT, 'app', 'page.tsx'), 'utf-8')
const NOT_FOUND = readFileSync(join(ROOT, 'app', 'not-found.tsx'), 'utf-8')
const SUBMIT = readFileSync(join(ROOT, 'app', 'submit', 'page.tsx'), 'utf-8')
const FOOTER = readFileSync(join(ROOT, 'components', 'Footer.tsx'), 'utf-8')
const PROFILE_CARD = readFileSync(join(ROOT, 'components', 'ProfileCard.tsx'), 'utf-8')
const ADMIN_PAGES = [
  readFileSync(join(ROOT, 'app', 'admin', 'page.tsx'), 'utf-8'),
  readFileSync(join(ROOT, 'app', 'admin', 'login', 'page.tsx'), 'utf-8'),
  readFileSync(join(ROOT, 'app', 'admin', 'profiles', 'page.tsx'), 'utf-8'),
  readFileSync(join(ROOT, 'app', 'admin', 'tools', 'level-sync', 'page.tsx'), 'utf-8'),
]

describe('public social typography and text color system', () => {
  it('ships Pretendard Variable as the only runtime font asset', () => {
    const pretendardDir = join(ROOT, 'public', 'fonts', 'pretendard')
    const dnfDir = join(ROOT, 'public', 'fonts', 'dnf-bitbit-v2')

    expect(existsSync(join(pretendardDir, 'PretendardVariable.woff2'))).toBe(true)
    expect(existsSync(join(pretendardDir, 'LICENSE.txt'))).toBe(true)
    expect(existsSync(join(dnfDir, 'DNFBitBitv2.otf'))).toBe(false)
    expect(existsSync(join(dnfDir, 'LICENSE.txt'))).toBe(false)
    expect(existsSync(join(dnfDir, 'THIRD_PARTY_NOTICES.md'))).toBe(false)
    expect(existsSync(join(ROOT, 'public', 'fonts', 'schoollove-classic-rpg', 'SchoolLoveClassicRPG-Regular.woff2'))).toBe(false)
  })

  it('uses Pretendard Variable as the sitewide default including admin pages', () => {
    expect(GLOBALS).toContain('--font-schoollove: "Pretendard Variable"')
    expect(GLOBALS).toContain('/fonts/pretendard/PretendardVariable.woff2')
    expect(GLOBALS).toContain('font-weight: 45 920')
    expect(GLOBALS).not.toContain('DNFBitBit')
    expect(GLOBALS).not.toContain('--font-admin-game')
    expect(GLOBALS).not.toContain('/fonts/dnf-bitbit-v2/')
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

  it('removes the Home-only selector and applies the shared family through an admin route class', () => {
    expect(GLOBALS).not.toContain('body:has(.home-social-ui)')
    expect(GLOBALS).not.toContain('--font-home-social')
    expect(HOME).not.toContain('home-social-ui')
    expect(GLOBALS).toContain('.admin-ui')
    expect(GLOBALS).not.toContain('.admin-game-ui')
    expect(ADMIN_PAGES.every((source) => source.includes('admin-ui'))).toBe(true)
    expect(ADMIN_PAGES.every((source) => !source.includes('admin-game-ui'))).toBe(true)
    expect(GLOBALS).not.toContain('Instagram Sans')
  })

  it('restores the approved public weight hierarchy without synthetic styles', () => {
    expect(GLOBALS).toContain('font-synthesis: none')
    expect(GLOBALS).not.toMatch(
      /font-family:\s*var\(--font-schoollove\)\s*!important;\s*font-weight:\s*400\s*!important/,
    )
    expect(GLOBALS).toMatch(/\.admin-ui[\s\S]*font-family:\s*var\(--font-schoollove\)\s*!important;/)
    expect(GLOBALS).not.toMatch(/\.admin-ui[\s\S]*font-weight:\s*400\s*!important/)
    expect(GLOBALS).toMatch(/\.admin-ui :where\(th\) \{\s*font-weight: 600;/)
    expect(GLOBALS).toMatch(/button,\s*\n\s*label \{\s*\n\s*font-weight: 500;/)
    expect(GLOBALS).toMatch(/h1 \{\s*\n\s*font-weight: 700;/)
    expect(GLOBALS).toMatch(/strong,\s*\n\s*b \{\s*\n\s*font-weight: 600;/)
  })

  it('uses the approved text color tokens without changing non-text accent tokens', () => {
    // v2-03: 텍스트·선·보조 배경은 schoollove-v3 목업 토큰으로 재매핑, 게임용 accent는 그대로 둔다.
    for (const color of ['#0a0a0a', '#6b7280', '#9ca3af', '#c62828']) {
      expect(GLOBALS).toContain(color)
    }
    expect(GLOBALS).toContain('--color-schoollove-text: var(--sl-ink)')
    for (const color of ['#0f7b5f', '#0b5f49', '#e6f4ef', '#0b6a51', '#f2f3f5', '#e5e7eb', '#d1d5db', '#fff7e6', '#8a5a00']) {
      expect(GLOBALS).toContain(color)
    }
    for (const color of ['#32e6b7', '#b7f84a', '#4f7cff', '#ff9f43']) {
      expect(GLOBALS).toContain(color)
    }
  })

  it('keeps the legacy v1 accent token values available for rollback', () => {
    for (const color of ['#32e6b7', '#b7f84a', '#4f7cff', '#ff9f43', '#fff4e6']) {
      expect(GLOBALS).toContain(color)
    }
  })

  it('styles shared home HUD labels in bold red and disables live motion when requested', () => {
    expect(GLOBALS).toMatch(/\.schoollove-hud-label \{[\s\S]*color: var\(--color-schoollove-hud-red\) !important;[\s\S]*font-family: var\(--font-schoollove\) !important;[\s\S]*font-weight: 700;/)
    expect(GLOBALS).toContain('animation: schoollove-live-label-pulse 1.4s ease-in-out infinite')
    expect(GLOBALS).toContain('opacity: 0.45')
    expect(GLOBALS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(GLOBALS).toMatch(/\.schoollove-live-label,[\s\S]*\.schoollove-live-dot \{\s*animation: none;/)
  })

  it('keeps black as the default text while explicitly preserving white text on dark actions', () => {
    expect(GLOBALS).toContain('body .btn-primary,')
    expect(GLOBALS).toContain('body .chip-active,')
    expect(GLOBALS).toContain('body .schoollove-dark-action,')
    expect(GLOBALS).toContain('color: #ffffff !important')
    expect(readFileSync(join(ROOT, 'components/SearchBar.tsx'), 'utf8')).toContain('schoollove-dark-action schoollove-focus')
    expect(GLOBALS).not.toContain('body :where(h1, h2, h3')
    expect(NOT_FOUND).toContain('className="btn-primary')
    expect(GLOBALS).toContain('body .schoollove-dark-action-hover:hover')
  })

  it('keeps the shared footer copyright and policy links on the general black text token', () => {
    expect(FOOTER).toContain('© 2026 스쿨러브아이. All rights reserved.')
    expect(FOOTER).toContain('mt-4 text-center text-xs text-schoollove-text')
    expect(FOOTER).not.toMatch(/text-neutral-(400|500)/)
  })

  it('uses opaque accessible secondary text for native placeholders', () => {
    expect(GLOBALS).toContain('body input:not(:disabled)::placeholder')
    expect(GLOBALS).toContain('body textarea:not(:disabled)::placeholder')
    expect(GLOBALS).toContain('color: var(--schoollove-text-secondary) !important')
    expect(GLOBALS).toContain('--schoollove-text-secondary: var(--sl-ink2)')
    expect(GLOBALS).toContain('opacity: 1 !important')
  })

  // v2-07: SchoolWarmth 검사는 컴포넌트와 함께 components/v1/SchoolWarmth.test.ts로 이동했다.
  it('keeps profile avatar initials black', () => {
    expect(PROFILE_CARD).toContain('justify-center text-schoollove-text font-bold text-sm')
    expect(PROFILE_CARD).not.toContain('justify-center text-gray-700 font-bold text-sm')
  })

  it('replaces the mobile registration title with a readable privacy maintenance notice', () => {
    const title = SUBMIT.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? ''
    expect(title).toContain('내 학교와 기억나는 사람을 찾아보세요')
    expect(title).toContain('break-keep')
    expect(title).not.toMatch(/overflow-hidden|truncate|scale-|transform/)
    expect(SUBMIT).not.toContain('기억나는 친구 이름을')
  })
})
