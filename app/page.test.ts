import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGE_SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')

describe('home data freshness contract', () => {
  it('uses ISR rather than forcing every request dynamic', () => {
    expect(PAGE_SOURCE).toMatch(/export const revalidate = 60/)
  })

  it('does not replace the established ISR policy with force-dynamic rendering', () => {
    expect(PAGE_SOURCE).not.toMatch(/export const dynamic = ['"]force-dynamic['"]/)
  })
})

describe('home global typography contract', () => {
  it('uses layout and color hierarchy without a local font override', () => {
    expect(PAGE_SOURCE).toContain('max-w-[1180px]')
    expect(PAGE_SOURCE).not.toContain('max-w-[600px]')
    expect(PAGE_SOURCE).not.toContain('font-game')
    expect(PAGE_SOURCE).not.toContain('font-retro')
  })

  it('keeps a dark hero and restrained status accents', () => {
    const headline = PAGE_SOURCE.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? ''

    expect(headline).toContain('text-schoollove-text')
    expect(headline).toContain('lg:text-[56px]')
    expect(headline).not.toMatch(/text-schoollove-(neon|electric|level|growth|system|warning)/)
    expect(PAGE_SOURCE).toContain('GROWTH ONLINE')
    expect(PAGE_SOURCE).toContain('GROWTH STATUS')
    expect(PAGE_SOURCE).toContain('text-schoollove-electric-blue')
  })

  it('keeps the status panel connected to existing ranking and activity arrays', () => {
    expect(PAGE_SOURCE).toContain('{rankingRows.length}')
    expect(PAGE_SOURCE).toContain('{activityItems.length}')
  })
})

describe('home persistent navigation contract', () => {
  it('shows desktop search and registration routes while retaining contextual CTAs', () => {
    expect(PAGE_SOURCE).toContain('hidden items-center gap-2 lg:flex')
    expect(PAGE_SOURCE).toContain('href="/search"')
    expect(PAGE_SOURCE).toContain('href="/submit"')
  })

  it('keeps both contextual CTA component instances after the feed', () => {
    expect((PAGE_SOURCE.match(/<HomeFeedCta/g) ?? []).length).toBe(2)
    expect(PAGE_SOURCE).toContain('href="/search"')
    expect(PAGE_SOURCE).toContain('href="/submit"')
  })
})
