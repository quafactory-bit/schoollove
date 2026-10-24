import { describe, expect, it } from 'vitest'
import {
  calculateAgeInKst,
  getKstCalendarDate,
  graduationYearRange,
  graduationYearRangeNotice,
  isAdultEligibleInKst,
  isGraduationYearAllowed,
} from './adultEligibility'

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

describe('v2-02 졸업연도 범위 — 재학 중 학교 차단', () => {
  // 2026-01-01 00:00 KST (UTC로는 2025-12-31 15:00)
  const kstNewYear2026 = new Date('2025-12-31T15:00:00.000Z')

  it('고등학교는 Y-1까지 허용한다', () => {
    expect(graduationYearRange('high', kstNewYear2026)).toEqual({ min: 1950, max: 2025 })
    expect(isGraduationYearAllowed('high', 2025, kstNewYear2026)).toBe(true)
    expect(isGraduationYearAllowed('high', 2026, kstNewYear2026)).toBe(false)
    expect(isGraduationYearAllowed('high', 1949, kstNewYear2026)).toBe(false)
  })

  it('중학교는 Y-4까지 허용한다', () => {
    expect(isGraduationYearAllowed('middle', 2022, kstNewYear2026)).toBe(true)
    expect(isGraduationYearAllowed('middle', 2023, kstNewYear2026)).toBe(false)
    expect(isGraduationYearAllowed('middle', 1950, kstNewYear2026)).toBe(true)
  })

  it('초등학교는 Y-7까지 허용한다', () => {
    expect(isGraduationYearAllowed('elementary', 2019, kstNewYear2026)).toBe(true)
    expect(isGraduationYearAllowed('elementary', 2020, kstNewYear2026)).toBe(false)
    expect(isGraduationYearAllowed('elementary', 2019.5, kstNewYear2026)).toBe(false)
  })

  it('대학교·전문대학은 올해까지 허용한다', () => {
    expect(isGraduationYearAllowed('university', 2026, kstNewYear2026)).toBe(true)
    expect(isGraduationYearAllowed('university', 2027, kstNewYear2026)).toBe(false)
    expect(isGraduationYearAllowed('college', 2026, kstNewYear2026)).toBe(true)
  })

  it('KST 연도 경계를 따른다', () => {
    const utcNewYearStillKst2025 = new Date('2025-12-31T14:59:59.999Z')
    expect(graduationYearRange('high', utcNewYearStillKst2025).max).toBe(2024)
  })

  it('안내 문구에 계산된 연도와 맞는 조사를 쓴다', () => {
    expect(graduationYearRangeNotice('high', kstNewYear2026)).toBe(
      '고등학교는 2025년 이하 졸업연도만 고를 수 있어요. 재학 중인 학교는 등록할 수 없어요.',
    )
    expect(graduationYearRangeNotice('college', kstNewYear2026)).toContain('전문대학은 2026년 이하')
  })
})
