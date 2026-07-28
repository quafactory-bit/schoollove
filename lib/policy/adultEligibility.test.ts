import { describe, expect, it } from 'vitest'
import { calculateAgeInKst, getKstCalendarDate, isAdultEligibleInKst } from './adultEligibility'

describe('KST 만 19세 판정', () => {
  const kstStartOfJuly28 = new Date('2026-07-27T15:00:00.000Z')

  it('KST 날짜를 UTC 경계와 분리한다', () => {
    expect(getKstCalendarDate(new Date('2026-07-27T14:59:59.999Z'))).toEqual({
      year: 2026,
      month: 7,
      day: 27,
    })
    expect(getKstCalendarDate(kstStartOfJuly28)).toEqual({ year: 2026, month: 7, day: 28 })
  })

  it('19번째 생일 당일부터 허용한다', () => {
    expect(calculateAgeInKst('2007-07-28', kstStartOfJuly28)).toBe(19)
    expect(isAdultEligibleInKst('2007-07-28', kstStartOfJuly28)).toBe(true)
    expect(isAdultEligibleInKst('2007-07-29', kstStartOfJuly28)).toBe(false)
  })

  it('윤년과 잘못된 날짜를 안전하게 처리한다', () => {
    expect(isAdultEligibleInKst('2008-02-29', new Date('2027-02-28T15:00:00.000Z'))).toBe(true)
    expect(calculateAgeInKst('2007-02-30', kstStartOfJuly28)).toBeNull()
    expect(calculateAgeInKst('not-a-date', kstStartOfJuly28)).toBeNull()
  })
})
