import { describe, expect, it } from 'vitest'
import { csvSafe, isFutureGraduationYear } from './operations'

describe('PHASE 10F operational policy', () => {
  it('rejects a future graduation year using KST year', () => {
    expect(isFutureGraduationYear(2027,new Date('2026-12-31T14:59:59Z'))).toBe(true)
    expect(isFutureGraduationYear(2027,new Date('2026-12-31T15:00:00Z'))).toBe(false)
  })

  it('neutralizes spreadsheet formulas and quotes fields', () => {
    expect(csvSafe('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"')
    expect(csvSafe('normal')).toBe('"normal"')
  })
})
