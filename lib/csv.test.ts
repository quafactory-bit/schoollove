import { describe, expect, it } from 'vitest'
import { createCsv, escapeCsvCell } from './csv'

describe('safe promotion CSV', () => {
  it.each(['=cmd()', '+SUM(1,2)', '-1+2', '@IMPORTXML()', '\tformula', '\rformula'])('neutralizes spreadsheet formula input: %s', (value) => {
    expect(escapeCsvCell(value)).toContain("'")
  })

  it('quotes delimiters and emits a UTF-8 BOM', () => {
    const csv = createCsv(['name'], [['a,"b"']])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"a,""b"""')
  })
})
