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
    for (const stage of SCHOOL_WORLD_STAGES) expect(existsSync(`public/images/fantasy-v3/${stage.asset}.webp`)).toBe(true)
  })
  it.each(['hero', 'dashboard', 'compact', 'share'] as const)('uses a distinct final school in %s mode', mode => {
    const final = renderToStaticMarkup(<SchoolWorld level={10} mode={mode} />)
    expect(final).toContain('school5.webp')
    expect(new Set(SCHOOL_WORLD_STAGES.map(stage => stage.asset)).size).toBe(5)
    expect(final).not.toMatch(/<svg|<foreignObject|<script/)
    for (const level of [undefined, 1, 2, 4, 7, 9]) expect(renderToStaticMarkup(<SchoolWorld level={level} mode={mode} />)).not.toContain('school5.webp')
  })
  it('server output is paused and exposes a control outside the hidden decoration', () => {
    const html = renderToStaticMarkup(<SchoolWorld />)
    expect(html).toContain('data-motion="paused"')
    expect(html).toContain('class="sl-world-canvas sl-world-canvas--scene" aria-hidden="true"')
    expect(html).toContain('</div><button type="button"')
    expect(html).toContain('움직임 멈추기')
  })
  it('compact art is static and never nests a button inside a ranking link', () => {
    const html = renderToStaticMarkup(<SchoolWorld mode="compact" level={10} />)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('school-friends-v1')
  })
  it('keeps every school illustration free of personal or uniform character overlays', () => {
    for (const level of [undefined,1,2,4,7,10]) {
      const html = renderToStaticMarkup(<SchoolWorld level={level} />)
      expect(html).not.toContain('school-friends-v1')
      expect(html).not.toMatch(/Lv\.|XP|progressbar|user|member/)
      expect(html).toContain('aria-hidden="true"')
    }
  })
  it('sizes are mode-specific and support a known 245px share preview', () => {
    expect(new Set(Object.values(SCHOOL_WORLD_SIZES)).size).toBe(4)
    const html = renderToStaticMarkup(<SchoolWorld mode="share" imageSizes="245px" />)
    expect(html).toContain('sizes="245px"')
    expect(html).toContain('width="1000" height="667"')
  })
  it('requests only the selected school image with responsive sizing', () => {
    const html = renderToStaticMarkup(<SchoolWorld priority />)
    expect(html).toContain('school3.webp')
    for (const other of [1,2,4,5]) expect(html).not.toContain('school'+other+'.webp')
    expect(html).not.toContain('image/avif')
    expect(html).toContain('sizes=')
  })
})
