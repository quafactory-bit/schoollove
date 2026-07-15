import { describe, expect, it } from 'vitest'
import { sortGrowthRanking, topGrowthRanking } from './schoolRanking'
import type { GrowthRankingInput } from '@/types/ranking'

function row(overrides: Partial<GrowthRankingInput> & { schoolId: string }): GrowthRankingInput {
  return {
    schoolName: '학교',
    slug: 'school',
    newVisibleProfiles: 0,
    mostRecentRegistrationAt: null,
    currentLevel: null,
    remainingToNext: 1,
    ...overrides,
  }
}

describe('sortGrowthRanking / topGrowthRanking', () => {
  it('newVisibleProfiles 내림차순으로 정렬되고 rank가 1부터 매겨진다', () => {
    const rows = [
      row({ schoolId: 'a', schoolName: 'A고', newVisibleProfiles: 3 }),
      row({ schoolId: 'b', schoolName: 'B고', newVisibleProfiles: 10 }),
      row({ schoolId: 'c', schoolName: 'C고', newVisibleProfiles: 5 }),
    ]

    const result = sortGrowthRanking(rows)

    expect(result.map((r) => r.schoolId)).toEqual(['b', 'c', 'a'])
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('m. newVisibleProfiles 동률이면 mostRecentRegistrationAt 내림차순', () => {
    const rows = [
      row({ schoolId: 'a', newVisibleProfiles: 5, mostRecentRegistrationAt: '2026-07-14T00:00:00.000Z' }),
      row({ schoolId: 'b', newVisibleProfiles: 5, mostRecentRegistrationAt: '2026-07-15T00:00:00.000Z' }),
    ]

    const result = sortGrowthRanking(rows)

    expect(result.map((r) => r.schoolId)).toEqual(['b', 'a'])
  })

  it('m. newVisibleProfiles와 mostRecentRegistrationAt까지 동률이면 schoolName 오름차순', () => {
    const sameTime = '2026-07-15T00:00:00.000Z'
    const rows = [
      row({ schoolId: 'a', schoolName: '다고', newVisibleProfiles: 5, mostRecentRegistrationAt: sameTime }),
      row({ schoolId: 'b', schoolName: '가고', newVisibleProfiles: 5, mostRecentRegistrationAt: sameTime }),
      row({ schoolId: 'c', schoolName: '나고', newVisibleProfiles: 5, mostRecentRegistrationAt: sameTime }),
    ]

    const result = sortGrowthRanking(rows)

    expect(result.map((r) => r.schoolId)).toEqual(['b', 'c', 'a'])
  })

  it('mostRecentRegistrationAt이 null인 항목은 값이 있는 항목보다 뒤로 밀린다', () => {
    const rows = [
      row({ schoolId: 'a', newVisibleProfiles: 5, mostRecentRegistrationAt: null }),
      row({ schoolId: 'b', newVisibleProfiles: 5, mostRecentRegistrationAt: '2026-07-15T00:00:00.000Z' }),
    ]

    const result = sortGrowthRanking(rows)

    expect(result.map((r) => r.schoolId)).toEqual(['b', 'a'])
  })

  it('n. 실제 학교 수가 5개 미만이면 있는 만큼만 반환(가짜 학교로 채우지 않음)', () => {
    const rows = [
      row({ schoolId: 'a', newVisibleProfiles: 3 }),
      row({ schoolId: 'b', newVisibleProfiles: 2 }),
      row({ schoolId: 'c', newVisibleProfiles: 1 }),
    ]

    const result = topGrowthRanking(rows, 5)

    expect(result).toHaveLength(3)
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('o. 신규 등록이 0건(빈 배열 입력)이면 빈 배열을 반환', () => {
    const result = topGrowthRanking([], 5)
    expect(result).toEqual([])
  })

  it('limit을 넘는 학교는 상위 N개만 반환', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ schoolId: `s${i}`, newVisibleProfiles: 8 - i })
    )

    const result = topGrowthRanking(rows, 5)

    expect(result).toHaveLength(5)
    expect(result[0].schoolId).toBe('s0')
    expect(result[4].schoolId).toBe('s4')
  })
})
