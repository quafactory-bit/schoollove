import { describe, expect, it, vi } from 'vitest'

const ranges = vi.hoisted(() => [] as Array<[number, number]>)
const total = vi.hoisted(() => ({ rows: 2500, failAtPage: -1 }))
vi.mock('@/lib/supabase', () => {
  const builder = {
    select: () => builder,
    order: () => builder,
    range: (from: number, to: number) => {
      ranges.push([from, to])
      if (ranges.length - 1 === total.failAtPage) return Promise.resolve({ data: null, error: { message: 'x' } })
      const count = Math.max(0, Math.min(to, total.rows - 1) - from + 1)
      return Promise.resolve({ data: Array.from({ length: count }, (_, i) => ({ slug: `s-${from + i}` })), error: null })
    },
  }
  return { supabase: { from: () => builder }, supabaseServer: { from: () => builder } }
})

import { getAllSchoolSlugs } from './schools'

describe('Part 2 P4: sitemap school slugs read every page', () => {
  it('collects more than 1,000 schools across pages', async () => {
    ranges.length = 0; total.rows = 2500; total.failAtPage = -1
    const slugs = await getAllSchoolSlugs()
    expect(slugs).toHaveLength(2500)
    expect(new Set(slugs).size).toBe(2500)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
  it('stops after an exact multiple with one empty page', async () => {
    ranges.length = 0; total.rows = 2000; total.failAtPage = -1
    expect(await getAllSchoolSlugs()).toHaveLength(2000)
    expect(ranges).toHaveLength(3)
  })
  it('fails closed to an empty list on a database error', async () => {
    ranges.length = 0; total.rows = 2500; total.failAtPage = 1
    expect(await getAllSchoolSlugs()).toEqual([])
  })
})
