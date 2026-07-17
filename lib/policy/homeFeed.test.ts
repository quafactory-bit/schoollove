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

  it('4. 날짜 정렬(register/trace를 합쳐 created_at 내림차순) — register id는 Phase 4A부터 학교+졸업연도+날짜 묶음 키를 쓴다', () => {
    const result = buildHomeActivityFeed(registerRows, traceRows, 10)
    expect(result.map((r) => r.id)).toEqual([
      'register:a-high::2020::2026-07-17',
      'trace:t1',
      'register:b-high::none::2026-07-17',
    ])
  })

  it('5. limit 적용', () => {
    const result = buildHomeActivityFeed(registerRows, traceRows, 2)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['register:a-high::2020::2026-07-17', 'trace:t1'])
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

describe('buildHomeActivityFeed — 등록 활동 묶기(Phase 4A, 1~20)', () => {
  function registerRow(overrides: Partial<RecentRegisterActivity> = {}): RecentRegisterActivity {
    return {
      id: 'p1',
      createdAt: '2026-07-17T10:00:00.000Z',
      graduationYear: 2022,
      school: { schoolName: '두루고등학교', slug: 'duru-high', currentLevel: 2 },
      ...overrides,
    }
  }

  it('1/20. 같은 학교·같은 졸업연도·같은 날짜 3건 → 1개 활동, count는 실제 원본 건수(3)', () => {
    const rows: RecentRegisterActivity[] = [
      registerRow({ id: 'p1', createdAt: '2026-07-17T10:00:00.000Z' }),
      registerRow({ id: 'p2', createdAt: '2026-07-17T11:00:00.000Z' }),
      registerRow({ id: 'p3', createdAt: '2026-07-17T09:00:00.000Z' }),
    ]
    const result = buildHomeActivityFeed(rows, [], 10)
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(3)
    expect(result[0].text).toBe('두루고등학교 2022년 졸업에 이름 3개가 새로 남겨졌어요.')
  })

  it('2. 같은 학교·다른 졸업연도 → 분리된 활동', () => {
    const rows: RecentRegisterActivity[] = [
      registerRow({ id: 'p1', graduationYear: 2022 }),
      registerRow({ id: 'p2', graduationYear: 2023 }),
    ]
    const result = buildHomeActivityFeed(rows, [], 10)
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.count === 1)).toBe(true)
  })

  it('3. 다른 학교·같은 졸업연도 → 분리된 활동', () => {
    const rows: RecentRegisterActivity[] = [
      registerRow({ id: 'p1', school: { schoolName: '두루고등학교', slug: 'duru-high', currentLevel: 2 } }),
      registerRow({ id: 'p2', school: { schoolName: '가고등학교', slug: 'ga-high', currentLevel: 1 } }),
    ]
    const result = buildHomeActivityFeed(rows, [], 10)
    expect(result).toHaveLength(2)
  })

  it('4. 같은 학교·같은 졸업연도·다른 날짜 → 분리된 활동', () => {
    const rows: RecentRegisterActivity[] = [
      registerRow({ id: 'p1', createdAt: '2026-07-17T10:00:00.000Z' }),
      registerRow({ id: 'p2', createdAt: '2026-07-16T10:00:00.000Z' }),
    ]
    const result = buildHomeActivityFeed(rows, [], 10)
    expect(result).toHaveLength(2)
  })

  it('5/19. 졸업연도 없는 같은 학교·같은 날짜 2건 → 묶이고 졸업연도 없는 복수 문구를 쓴다', () => {
    const rows: RecentRegisterActivity[] = [
      registerRow({ id: 'p1', graduationYear: null, createdAt: '2026-07-17T10:00:00.000Z' }),
      registerRow({ id: 'p2', graduationYear: null, createdAt: '2026-07-17T11:00:00.000Z' }),
    ]
    const result = buildHomeActivityFeed(rows, [], 10)
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(2)
    expect(result[0].text).toBe('두루고등학교에 이름 2개가 새로 남겨졌어요.')
  })

  it('6. 등록 1건 → 기존 단수 문구를 그대로 쓴다', () => {
    const result = buildHomeActivityFeed([registerRow({ id: 'p1' })], [], 10)
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(1)
    expect(result[0].text).toBe('누군가 두루고등학교 2022년 졸업에 이름을 남겼어요.')
  })

  it('8. 묶음의 대표 createdAt은 입력 순서와 무관하게 가장 최신 시간이다', () => {
    const rows: RecentRegisterActivity[] = [
      registerRow({ id: 'p1', createdAt: '2026-07-17T09:00:00.000Z' }),
      registerRow({ id: 'p2', createdAt: '2026-07-17T23:00:00.000Z' }),
      registerRow({ id: 'p3', createdAt: '2026-07-17T05:00:00.000Z' }),
    ]
    const result = buildHomeActivityFeed(rows, [], 10)
    expect(result).toHaveLength(1)
    expect(result[0].createdAt).toBe('2026-07-17T23:00:00.000Z')
  })

  it('9. 묶은 뒤에도 전체 활동은 createdAt(등록 묶음은 대표 시간) 내림차순으로 정렬된다', () => {
    const registerRows: RecentRegisterActivity[] = [
      registerRow({ id: 'p1', graduationYear: 2022, createdAt: '2026-07-17T08:00:00.000Z' }),
      registerRow({ id: 'p2', graduationYear: 2022, createdAt: '2026-07-17T12:00:00.000Z' }),
      registerRow({
        id: 'p3',
        graduationYear: 2023,
        createdAt: '2026-07-17T18:00:00.000Z',
      }),
    ]
    const traceRows: RecentTraceActivity[] = [
      {
        id: 't1',
        createdAt: '2026-07-17T15:00:00.000Z',
        message: '나 여기 있어',
        school: { schoolName: '두루고등학교', slug: 'duru-high', currentLevel: 2 },
      },
    ]
    const result = buildHomeActivityFeed(registerRows, traceRows, 10)
    const createdAts = result.map((r) => r.createdAt)
    const sorted = [...createdAts].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    expect(createdAts).toEqual(sorted)
    expect(result[0].id).toBe('register:duru-high::2023::2026-07-17')
  })

  it('10. trace는 같은 학교·같은 날짜 등록과도 합쳐지지 않는다', () => {
    const registerRows: RecentRegisterActivity[] = [registerRow({ id: 'p1', createdAt: '2026-07-17T10:00:00.000Z' })]
    const traceRows: RecentTraceActivity[] = [
      {
        id: 't1',
        createdAt: '2026-07-17T11:00:00.000Z',
        message: '나 여기 있어',
        school: { schoolName: '두루고등학교', slug: 'duru-high', currentLevel: 2 },
      },
    ]
    const result = buildHomeActivityFeed(registerRows, traceRows, 10)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.type).sort()).toEqual(['register', 'trace'])
  })

  it('11. trace끼리도 서로 합쳐지지 않는다', () => {
    const traceRows: RecentTraceActivity[] = [
      {
        id: 't1',
        createdAt: '2026-07-17T10:00:00.000Z',
        message: '나 여기 있어',
        school: { schoolName: '두루고등학교', slug: 'duru-high', currentLevel: 2 },
      },
      {
        id: 't2',
        createdAt: '2026-07-17T11:00:00.000Z',
        message: '나도 있어',
        school: { schoolName: '두루고등학교', slug: 'duru-high', currentLevel: 2 },
      },
    ]
    const result = buildHomeActivityFeed([], traceRows, 10)
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.count === 1)).toBe(true)
  })

  it('12. 묶은 뒤 최종 활동 수는 limit(16)을 넘지 않는다', () => {
    const registerRows: RecentRegisterActivity[] = Array.from({ length: 20 }, (_, i) =>
      registerRow({
        id: `p${i}`,
        graduationYear: i,
        createdAt: `2026-07-17T${String(i % 24).padStart(2, '0')}:00:00.000Z`,
      })
    )
    const result = buildHomeActivityFeed(registerRows, [], 16)
    expect(result.length).toBeLessThanOrEqual(16)
    expect(result).toHaveLength(16)
  })

  it('18. 묶은 활동도 학교 slug(링크)를 그대로 유지한다', () => {
    const rows: RecentRegisterActivity[] = [
      registerRow({ id: 'p1' }),
      registerRow({ id: 'p2' }),
    ]
    const result = buildHomeActivityFeed(rows, [], 10)
    expect(result[0].slug).toBe('duru-high')
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
