import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync } from 'node:fs'
import SchoolWorld, { getSchoolWorldStage, SCHOOL_WORLD_STAGES, SCHOOL_WORLD_SIZES } from './SchoolWorld'

describe('school world presentation stages', () => {
  it.each([[1,0],[1.9,0],[2,1],[3,1],[4,2],[6,2],[7,3],[9,3],[10,4],[11,4],[99,4]])('maps level %i to visual index %i without capability changes', (level,index) => {
    expect(getSchoolWorldStage(level)).toBe(SCHOOL_WORLD_STAGES[index])
  })
  it.each([NaN,Infinity,-1,0])('uses the quiet first stage for invalid level %s', level => {
    expect(getSchoolWorldStage(level)).toBe(SCHOOL_WORLD_STAGES[0])
  })
  it('decorative home/share art contains no level, personal or activity claim', () => {
    const html = renderToStaticMarkup(<SchoolWorld mode="share" />)
    expect(html).toContain('data-world-stage="decorative"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toMatch(/Lv\.|XP|progressbar|user|member/)
  })
  it('all stage assets resolve to actual optimized project files', () => {
    for (const stage of SCHOOL_WORLD_STAGES) expect(existsSync(`public/images/game/${stage.asset}.webp`)).toBe(true)
  })
  it('server output is paused and exposes a control outside the hidden decoration', () => {
    const html = renderToStaticMarkup(<SchoolWorld />)
    expect(html).toContain('data-motion="paused"')
    expect(html).toContain('class="sl-world-canvas" aria-hidden="true"')
    expect(html).toContain('</div><button type="button"')
    expect(html).toContain('움직임 멈추기')
  })
  it('compact art is static and never nests a button inside a ranking link', () => {
    const html = renderToStaticMarkup(<SchoolWorld mode="compact" level={10} />)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('school-friends-v1')
  })
  it('all non-compact stages reuse one fixed decorative duo, independent of level', () => {
    for (const level of [undefined,1,2,4,7,10]) {
      const html = renderToStaticMarkup(<SchoolWorld level={level} />)
      expect(html).toContain('school-friends-v1.webp')
      expect((html.match(/class="sl-world-friends"/g) ?? []).length).toBe(1)
    }
  })
  it('sizes are mode-specific and support a known 245px share preview', () => {
    expect(new Set(Object.values(SCHOOL_WORLD_SIZES)).size).toBe(4)
    const html = renderToStaticMarkup(<SchoolWorld mode="share" imageSizes="245px" />)
    expect(html).toContain('sizes="245px"')
    expect(html).toContain('width="1000" height="667"')
  })
  it('preloads only the typed AVIF hero and retains responsive WebP fallback', () => {
    const html = renderToStaticMarkup(<SchoolWorld priority />)
    expect(html).toContain('type="image/avif"')
    const source = html.match(/<picture><source srcSet="([^"]+)" type="image\/avif"/)?.[1]
    expect(source).toContain('growing-campus-v2')
    expect(html).toContain('growing-campus.webp')
    const hints = html.match(/<link[^>]+rel="preload"[^>]*>/g) ?? []
    expect(hints).toHaveLength(1)
    expect(hints[0]).toContain('growing-campus-v2.avif')
    expect(hints[0]).toContain(`href="${source}"`)
  })
  it('does not request other stages or a second hero format via preload', () => {
    const html = renderToStaticMarkup(<SchoolWorld priority />)
    expect(html).not.toContain('first-reunion-v1.webp')
    expect(html).not.toContain('lively-school-v1.webp')
    const hints = html.match(/<link[^>]+rel="preload"[^>]*>/g) ?? []
    expect(hints).toHaveLength(1)
    expect(hints[0]).not.toContain('_next/image')
    expect(renderToStaticMarkup(<SchoolWorld mode="share" priority />)).not.toContain('image/avif')
  })
})
