import { beforeEach, describe, expect, it, vi } from 'vitest'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
import { getSchoolYearCounts, normalizeSchoolYearCounts, parseGraduationYearParam } from './schoolYearCounts'

beforeEach(() => { rpc.mockReset() })

describe('v2-04 school year counts', () => {
  it('keeps only valid year/count numbers, drops zero and extra columns, newest first', () => {
    expect(normalizeSchoolYearCounts([
      { graduation_year: 2005, count: 3, display_name: 'x' },
      { graduation_year: 2012, count: 1 },
      { graduation_year: 2009, count: 0 },
      { graduation_year: 'bad', count: 2 },
    ])).toEqual([{ graduationYear: 2012, count: 1 }, { graduationYear: 2005, count: 3 }])
    expect(normalizeSchoolYearCounts(null)).toEqual([])
  })

  it('calls school_year_counts_v2 and sums the school total on the client', async () => {
    rpc.mockResolvedValue({ data: [{ graduation_year: 2005, count: 3 }, { graduation_year: 2006, count: 1 }], error: null })
    const result = await getSchoolYearCounts('school-id')
    expect(rpc).toHaveBeenCalledWith('school_year_counts_v2', { p_school_id: 'school-id' })
    expect(result).toEqual({ status: 'ok', total: 4, years: [{ graduationYear: 2006, count: 1 }, { graduationYear: 2005, count: 3 }] })
  })

  it('degrades to unavailable without throwing (e.g. before the migration is applied)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
    expect(await getSchoolYearCounts('school-id')).toEqual({ status: 'unavailable', years: [], total: 0 })
  })

  it('accepts only four-digit plausible graduation years in the URL', () => {
    expect(parseGraduationYearParam('2005')).toBe(2005)
    for (const bad of ['05', '2005a', '1900', '99999', '']) expect(parseGraduationYearParam(bad)).toBeNull()
  })
})
