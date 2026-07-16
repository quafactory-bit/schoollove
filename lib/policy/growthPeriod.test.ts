import { describe, expect, it } from 'vitest'
import { getRecentWeekStart, getSeoulTodayStartUtc } from './growthPeriod'

describe('getRecentWeekStart — p. 최근 7일 시작 시각', () => {
  it('now로부터 정확히 7*24시간 이전을 반환한다', () => {
    const now = new Date('2026-07-15T10:00:00.000Z')
    const result = getRecentWeekStart(now)

    expect(result.toISOString()).toBe('2026-07-08T10:00:00.000Z')
  })

  it('일반 날짜: 월 경계를 넘어가도 정확히 계산된다', () => {
    const now = new Date('2026-08-03T00:00:00.000Z')
    const result = getRecentWeekStart(now)

    expect(result.toISOString()).toBe('2026-07-27T00:00:00.000Z')
  })
})

describe('getSeoulTodayStartUtc — m. KST 자정 경계 / n. 월말 / o. 연말', () => {
  it('일반 날짜: KST 오후 시각 → 같은 KST 날짜의 00:00(UTC 전날 15:00)', () => {
    // 2026-07-15T05:00:00Z(UTC) = 2026-07-15T14:00:00 KST
    const now = new Date('2026-07-15T05:00:00.000Z')
    const result = getSeoulTodayStartUtc(now)

    expect(result.toISOString()).toBe('2026-07-14T15:00:00.000Z') // = 2026-07-15T00:00:00 KST
  })

  it('UTC 기준 전날이지만 KST는 다음날인 시각(UTC 16:00 = KST 다음날 01:00)', () => {
    const now = new Date('2026-07-14T16:00:00.000Z') // KST 2026-07-15T01:00:00
    const result = getSeoulTodayStartUtc(now)

    expect(result.toISOString()).toBe('2026-07-14T15:00:00.000Z') // = 2026-07-15T00:00:00 KST
  })

  it('KST 자정 직전(23:59:59.999 KST)에는 그 날짜의 00:00을 반환', () => {
    const now = new Date('2026-07-14T14:59:59.999Z') // KST 2026-07-14T23:59:59.999
    const result = getSeoulTodayStartUtc(now)

    expect(result.toISOString()).toBe('2026-07-13T15:00:00.000Z') // = 2026-07-14T00:00:00 KST
  })

  it('KST 자정 정확히(00:00:00.000 KST)에는 자기 자신을 반환', () => {
    const now = new Date('2026-07-14T15:00:00.000Z') // KST 2026-07-15T00:00:00.000 정확히
    const result = getSeoulTodayStartUtc(now)

    expect(result.getTime()).toBe(now.getTime())
  })

  it('m. KST 자정 경계 전후 1ms 차이로 날짜가 정확히 갈린다', () => {
    const justBefore = new Date('2026-07-14T14:59:59.999Z')
    const exactly = new Date('2026-07-14T15:00:00.000Z')

    const beforeResult = getSeoulTodayStartUtc(justBefore)
    const exactResult = getSeoulTodayStartUtc(exactly)

    expect(beforeResult.toISOString()).toBe('2026-07-13T15:00:00.000Z')
    expect(exactResult.toISOString()).toBe('2026-07-14T15:00:00.000Z')
  })

  it('n. 월말(7월→8월 KST 경계)에도 정확히 날짜가 넘어간다', () => {
    // 2026-07-31T15:00:00Z(UTC) = 2026-08-01T00:00:00 KST 정확히
    const now = new Date('2026-07-31T15:00:00.000Z')
    const result = getSeoulTodayStartUtc(now)

    expect(result.toISOString()).toBe('2026-07-31T15:00:00.000Z')
  })

  it('n. 월말 직전(7월 31일 KST 23:59:59.999)에는 7월 31일 00:00 KST를 반환', () => {
    const now = new Date('2026-07-31T14:59:59.999Z') // KST 2026-07-31T23:59:59.999
    const result = getSeoulTodayStartUtc(now)

    expect(result.toISOString()).toBe('2026-07-30T15:00:00.000Z') // = 2026-07-31T00:00:00 KST
  })

  it('o. 연말(12월→1월 KST 경계)에도 연도가 정확히 넘어간다', () => {
    // 2026-12-31T15:00:00Z(UTC) = 2027-01-01T00:00:00 KST 정확히
    const now = new Date('2026-12-31T15:00:00.000Z')
    const result = getSeoulTodayStartUtc(now)

    expect(result.toISOString()).toBe('2026-12-31T15:00:00.000Z')
  })

  it('o. 연말 직전(12월 31일 KST 23:59:59.999)에는 12월 31일 00:00 KST를 반환', () => {
    const now = new Date('2026-12-31T14:59:59.999Z') // KST 2026-12-31T23:59:59.999
    const result = getSeoulTodayStartUtc(now)

    expect(result.toISOString()).toBe('2026-12-30T15:00:00.000Z') // = 2026-12-31T00:00:00 KST
  })

  it('결과는 항상 now보다 작거나 같다(미래 시각을 반환하지 않음)', () => {
    const samples = [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-06-15T12:34:56.000Z'),
      new Date('2026-12-31T23:59:59.999Z'),
    ]
    for (const now of samples) {
      const result = getSeoulTodayStartUtc(now)
      expect(result.getTime()).toBeLessThanOrEqual(now.getTime())
    }
  })
})
