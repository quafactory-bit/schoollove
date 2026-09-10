import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync } from 'node:fs'
import SchoolWorld, { getSchoolWorldStage, SCHOOL_WORLD_STAGES } from './SchoolWorld'

describe('school world presentation stages', () => {
  it.each([[1,0],[2,1],[3,1],[4,2],[6,2],[7,3],[9,3],[10,4],[99,4]])('maps level %i to visual index %i without capability changes', (level,index) => {
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
})
