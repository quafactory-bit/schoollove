import { describe, expect, it } from 'vitest'
import {
  buildHomeActivityFeed,
  buildWeeklyRankingViewRow,
  formatRegisterActivityText,
  formatRelativeTime,
  formatTodayGrowthStripText,
  formatTraceActivityText,
  getFeedCtaVisibility,
} from './homeFeed'
import type { RecentRegisterActivity, RecentTraceActivity } from '@/types/homeFeed'
import type { GrowthRankingRow } from '@/types/ranking'

function rankingRow(overrides: Partial<GrowthRankingRow> = {}): GrowthRankingRow {
  return {
    rank: 1,
    schoolId: 's1',
    schoolName: '가고등학교',
    slug: 'ga-high',
    newVisibleProfiles: 2,
    mostRecentRegistrationAt: '2026-07-16T00:00:00.000Z',
    currentLevel: 1,
    remainingToNext: 999,
    visibleProfileCount: 6,
    ...overrides,
  }
}

describe('formatRegisterActivityText — 최근 활동 문구(1,2,3)', () => {
  it('1. 실제 등록 활동 문구(졸업연도 없음)', () => {
    expect(formatRegisterActivityText('두루고등학교', null)).toBe('누군가 두루고등학교에 이름을 남겼어요.')
  })

  it('2. 졸업연도가 있을 때 문구', () => {
    expect(formatRegisterActivityText('두루고등학교', 2024)).toBe(
      '누군가 두루고등학교 2024년 졸업에 이름을 남겼어요.'
    )
  })

  it('3. 개인 이름/인스타 표현이 문구에 없다', () => {
    const text = formatRegisterActivityText('두루고등학교', 2024)
    expect(text).not.toMatch(/instagram/i)
    expect(text).not.toContain('@')
  })
})

describe('formatTraceActivityText — 흔적 문구는 짧게 표시', () => {
  it('40자 흔적 메시지도 20자 이내로 잘라서 표시한다', () => {
    const longMessage = '가'.repeat(40)
    const text = formatTraceActivityText('두루고등학교', longMessage)
    expect(text).toContain('두루고등학교')
    expect(text).toContain('...')
    expect(text.length).toBeLessThan(longMessage.length + 20)
  })

  it('짧은 메시지는 그대로 노출한다', () => {
    expect(formatTraceActivityText('두루고등학교', '친구들아 나 기억해?')).toBe(
      '누군가 두루고등학교에 흔적을 남겼어요 · 친구들아 나 기억해?'
    )
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-17T12:00:00.000Z')

  it('1분 미만은 방금 전', () => {
    expect(formatRelativeTime('2026-07-17T11:59:40.000Z', now)).toBe('방금 전')
  })

  it('1시간 미만은 N분 전', () => {
    expect(formatRelativeTime('2026-07-17T11:30:00.000Z', now)).toBe('30분 전')
  })

  it('24시간 미만은 N시간 전', () => {
    expect(formatRelativeTime('2026-07-17T03:00:00.000Z', now)).toBe('9시간 전')
  })

  it('7일 미만은 N일 전', () => {
    expect(formatRelativeTime('2026-07-15T12:00:00.000Z', now)).toBe('2일 전')
  })

  it('7일 이상은 날짜로 표시', () => {
    expect(formatRelativeTime('2026-07-01T12:00:00.000Z', now)).toBe('2026.07.01')
  })
})

describe('formatTodayGrowthStripText', () => {
  it('오늘 성장 학교 문구를 만든다', () => {
    expect(formatTodayGrowthStripText('두루고등학교', 3)).toBe('오늘 가장 빠르게 성장 중 · 두루고등학교 +3명')
  })
})

describe('buildHomeActivityFeed — 최근 활동(4,5,6,7)', () => {
  const registerRows: RecentRegisterActivity[] = [
    {
      id: 'p1',
      createdAt: '2026-07-17T10:00:00.000Z',
      graduationYear: 2020,
      school: { schoolName: 'A고등학교', slug: 'a-high', currentLevel: 2 },
    },
    {
      id: 'p2',
      createdAt: '2026-07-17T08:00:00.000Z',
      graduationYear: null,
      school: { schoolName: 'B고등학교', slug: 'b-high', currentLevel: null },
    },
  ]

  const traceRows: RecentTraceActivity[] = [
    {
      id: 't1',
      createdAt: '2026-07-17T09:00:00.000Z',
      message: '나 여기 있어',
      school: { schoolName: 'C고등학교', slug: 'c-high', currentLevel: 3 },
    },
  ]

  it('4. 날짜 정렬(register/trace를 합쳐 created_at 내림차순)', () => {
    const result = buildHomeActivityFeed(registerRows, traceRows, 10)
    expect(result.map((r) => r.id)).toEqual(['register:p1', 'trace:t1', 'register:p2'])
  })

  it('5. limit 적용', () => {
    const result = buildHomeActivityFeed(registerRows, traceRows, 2)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['register:p1', 'trace:t1'])
  })

  it('6. 빈 배열 입력이면 빈 배열 반환', () => {
    expect(buildHomeActivityFeed([], [], 10)).toEqual([])
  })

  it('7. school이 null(join 실패)인 행은 제외한다', () => {
    const withNullSchool: RecentRegisterActivity[] = [
      { id: 'p3', createdAt: '2026-07-17T11:00:00.000Z', graduationYear: null, school: null },
    ]
    const result = buildHomeActivityFeed(withNullSchool, [], 10)
    expect(result).toEqual([])
  })

  it('개인 식별 필드(nickname/instagram)가 결과 어디에도 없다', () => {
    const result = buildHomeActivityFeed(registerRows, traceRows, 10)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/nickname/i)
    expect(serialized).not.toMatch(/instagram/i)
  })
})

describe('buildWeeklyRankingViewRow — 사람 수 성장 helper 재사용(19,20,21)', () => {
  it('19. 6명 학교 → 다음 단계까지 5명, 진행률 50%', () => {
    const row = buildWeeklyRankingViewRow(rankingRow({ visibleProfileCount: 6 }))
    expect(row.remainingLabel).toBe('다음 성장 단계까지 5명')
    expect(row.progressPercent).toBe(50)
    expect(row.isNearGrowth).toBe(false)
    expect(row.isComplete).toBe(false)
  })

  it('20. 9명 학교 → 성장 임박(다음 단계까지 2명)', () => {
    const row = buildWeeklyRankingViewRow(rankingRow({ visibleProfileCount: 9 }))
    expect(row.remainingLabel).toBe('다음 성장 단계까지 2명')
    expect(row.isNearGrowth).toBe(true)
  })

  it('21. 11명 이상 → 활성 상태(다음 목표 없음)', () => {
    const row = buildWeeklyRankingViewRow(rankingRow({ visibleProfileCount: 11 }))
    expect(row.remainingLabel).toBeNull()
    expect(row.isComplete).toBe(true)
    expect(row.progressPercent).toBe(100)
  })

  it('rank/schoolName/slug/newVisibleProfiles/visibleProfileCount/currentLevel을 그대로 전달한다', () => {
    const row = buildWeeklyRankingViewRow(
      rankingRow({ rank: 3, schoolName: '나고등학교', slug: 'na-high', newVisibleProfiles: 4, currentLevel: 2 })
    )
    expect(row.rank).toBe(3)
    expect(row.schoolName).toBe('나고등학교')
    expect(row.slug).toBe('na-high')
    expect(row.newVisibleProfiles).toBe(4)
    expect(row.currentLevel).toBe(2)
  })
})

describe('getFeedCtaVisibility — 피드 CTA 배치(22,23)', () => {
  it('활동이 4개 미만이면 검색 CTA도 표시하지 않는다', () => {
    expect(getFeedCtaVisibility(3)).toEqual({ showSearchCta: false, showSubmitCta: false })
  })

  it('22/23. 활동이 4개 이상이면 검색 CTA 표시(항상 첫 활동 이후)', () => {
    expect(getFeedCtaVisibility(4)).toEqual({ showSearchCta: true, showSubmitCta: false })
  })

  it('활동이 8개 이상이면 등록 CTA도 함께 표시한다', () => {
    expect(getFeedCtaVisibility(8)).toEqual({ showSearchCta: true, showSubmitCta: true })
  })
})
