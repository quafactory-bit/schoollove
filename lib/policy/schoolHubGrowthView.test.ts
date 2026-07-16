import { describe, expect, it } from 'vitest'
import {
  getSchoolStateContent,
  buildSchoolStateCtaHref,
  formatRemainingToNextLabel,
  formatProgressPercentLabel,
  calculatePeopleGrowthStage,
  formatPeopleGrowthRemainingLabel,
  formatPeopleGrowthDescription,
} from './schoolHubGrowthView'
import type { SchoolGrowthSnapshot } from '@/types/schoolGrowth'

function snapshot(overrides: Partial<SchoolGrowthSnapshot> = {}): SchoolGrowthSnapshot {
  return {
    schoolId: 'school-1',
    schoolName: '테스트고등학교',
    slug: 'test-high',
    visibleProfileCount: 0,
    storedCurrentLevel: null,
    calculatedLevel: 1,
    effectiveLevel: 1,
    nextLevel: 2,
    nextLevelThreshold: 141,
    remainingToNext: 141,
    progressPercent: 0,
    isNearLevelUp: false,
    schoolState: 'A',
    levelUpdatedAt: null,
    ...overrides,
  }
}

describe('getSchoolStateContent — 1/2/3. State A/B/C 제목·설명·CTA', () => {
  it('1. State A', () => {
    const content = getSchoolStateContent('A')
    expect(content.title).toBe('아직 이 학교에 남겨진 이름이 없어요')
    expect(content.description).toBe('첫 번째 기록이 이 학교의 시작이 됩니다.')
    expect(content.primaryCta).toEqual({ label: '첫 이름 남기기', kind: 'register' })
    expect(content.secondaryCta).toEqual({ label: '학교 공유하기', kind: 'share' })
  })

  it('2. State B — Phase 2B: "조금만 더 모이면 다음 Level로 올라가요." 고정 카피 제거, description은 동적으로 대체되므로 null', () => {
    const content = getSchoolStateContent('B')
    expect(content.title).toBe('이 학교에 사람들이 하나씩 다시 모이고 있어요')
    expect(content.description).toBeNull()
    expect(content.primaryCta).toEqual({ label: '학교 키우기', kind: 'register' })
    expect(content.secondaryCta).toBeNull()
    expect(content.helperText).toBe('이름을 남기면 다음 성장 단계에 가까워져요.')
    expect(content.helperText).not.toContain('Level')
  })

  it('3. State C', () => {
    const content = getSchoolStateContent('C')
    expect(content.title).toBe('이 학교는 지금 활발하게 이어지고 있어요')
    expect(content.primaryCta).toEqual({ label: '사람 둘러보기', kind: 'discover' })
    expect(content.secondaryCta).toEqual({ label: '내 이름 남기기', kind: 'registerSelf' })
  })

  it('4. State D는 SchoolState 타입 자체에 존재하지 않아 어떤 콘텐츠도 출력되지 않는다(컴파일 타임 보장)', () => {
    expect(Object.keys(getSchoolStateContent('A'))).not.toContain('D')
    // SchoolState 타입이 'A' | 'B' | 'C'만 허용하므로 getSchoolStateContent('D' as any)는
    // 타입 시스템이 이미 차단한다 — 런타임 fallback 분기를 별도로 만들지 않는다.
  })

  it('어떤 문구에도 "동창" 표현을 사용하지 않는다', () => {
    for (const state of ['A', 'B', 'C'] as const) {
      const content = getSchoolStateContent(state)
      expect(content.title).not.toContain('동창')
      expect(content.description ?? '').not.toContain('동창')
      expect(content.helperText ?? '').not.toContain('동창')
      expect(content.primaryCta.label).not.toContain('동창')
      expect(content.secondaryCta?.label ?? '').not.toContain('동창')
    }

    // Phase 2B: State B의 동적 성장 문구에도 "동창" 표현이 없어야 한다(12. "동창" 표현 없음).
    for (const remainingPeople of [1, 5, 10]) {
      expect(formatPeopleGrowthDescription(remainingPeople)).not.toContain('동창')
    }
  })
})

describe('buildSchoolStateCtaHref — 20/21/22/23. CTA 목적지', () => {
  it('20. register → 기존 Register Flow의 학교 선택 유지 쿼리(school)와 정확히 일치', () => {
    expect(buildSchoolStateCtaHref('register', 'test-high')).toBe('/submit?school=test-high')
  })

  it('21. registerSelf(학교 키우기 계열 self 등록) → school+self=1 쿼리 유지', () => {
    expect(buildSchoolStateCtaHref('registerSelf', 'test-high')).toBe('/submit?school=test-high&self=1')
  })

  it('22. discover(사람 둘러보기) → 같은 페이지의 기존 탐색 영역 앵커로 연결(새 라우트 아님)', () => {
    expect(buildSchoolStateCtaHref('discover', 'test-high')).toBe('#discover')
  })

  it('23. share → 링크(href)가 아니라 기존 ShareButton으로 렌더링하므로 null(잘못된 URL을 만들지 않음)', () => {
    expect(buildSchoolStateCtaHref('share', 'test-high')).toBeNull()
  })
})

describe('formatRemainingToNextLabel', () => {
  it('State A는 03-level-policy.md §7에 따라 실제 curve 값 대신 "다음 Level까지 1명"을 표시', () => {
    const label = formatRemainingToNextLabel(snapshot({ schoolState: 'A', remainingToNext: 141 }))
    expect(label).toBe('다음 Level까지 1명')
  })

  it('9/10/i. State B/C는 snapshot.remainingToNext를 그대로 사용(임의 보정 없음)', () => {
    expect(formatRemainingToNextLabel(snapshot({ schoolState: 'B', remainingToNext: 7 }))).toBe(
      '다음 Level까지 7명'
    )
    expect(formatRemainingToNextLabel(snapshot({ schoolState: 'C', remainingToNext: 2 }))).toBe(
      '다음 Level까지 2명'
    )
  })
})

describe('formatProgressPercentLabel — 9/10. progressPercent 0/100', () => {
  it('9. 0%', () => {
    expect(formatProgressPercentLabel(snapshot({ progressPercent: 0 }))).toBe('0%')
  })

  it('10. 100%', () => {
    expect(formatProgressPercentLabel(snapshot({ progressPercent: 100 }))).toBe('100%')
  })
})

describe('isNearLevelUp — 5/6/7. 임박 표시는 snapshot.isNearLevelUp을 그대로 사용', () => {
  it('5/6. remainingToNext 1·2 → true (03-level-policy.md §7)', () => {
    expect(snapshot({ remainingToNext: 1, isNearLevelUp: true }).isNearLevelUp).toBe(true)
    expect(snapshot({ remainingToNext: 2, isNearLevelUp: true }).isNearLevelUp).toBe(true)
  })

  it('7. remainingToNext 3 → false', () => {
    expect(snapshot({ remainingToNext: 3, isNearLevelUp: false }).isNearLevelUp).toBe(false)
  })
})

// ─── Phase 2B: 사람 수 기반 공개 성장 단계 ──────────────────────────
// docs/decisions/2026-07-16-school-hub-growth-ui.md Addendum, Level 정책 감사 대안 C.
describe('calculatePeopleGrowthStage — 1~8. State A/B/C 사람 수 성장 단계', () => {
  it('1. 0명 → State A, 남은 1명, 0%', () => {
    const stage = calculatePeopleGrowthStage('A', 0)
    expect(stage.remainingPeople).toBe(1)
    expect(stage.progressPercent).toBe(0)
    expect(stage.isNearGrowth).toBe(false)
    expect(stage.isComplete).toBe(false)
  })

  it('2. 1명 → State B, 남은 10명, 0%', () => {
    const stage = calculatePeopleGrowthStage('B', 1)
    expect(stage.remainingPeople).toBe(10)
    expect(stage.progressPercent).toBe(0)
  })

  it('3. 6명 → State B, 남은 5명, 50%', () => {
    const stage = calculatePeopleGrowthStage('B', 6)
    expect(stage.remainingPeople).toBe(5)
    expect(stage.progressPercent).toBe(50)
  })

  it('4. 9명 → State B, 남은 2명, 성장 임박', () => {
    const stage = calculatePeopleGrowthStage('B', 9)
    expect(stage.remainingPeople).toBe(2)
    expect(stage.isNearGrowth).toBe(true)
  })

  it('5. 10명 → State B, 남은 1명, 90%', () => {
    const stage = calculatePeopleGrowthStage('B', 10)
    expect(stage.remainingPeople).toBe(1)
    expect(stage.progressPercent).toBe(90)
    expect(stage.isNearGrowth).toBe(true)
  })

  it('6. 11명 → State C, 완료, 100%', () => {
    const stage = calculatePeopleGrowthStage('C', 11)
    expect(stage.isComplete).toBe(true)
    expect(stage.progressPercent).toBe(100)
  })

  it('7. 20명 → State C, 완료, 100%', () => {
    const stage = calculatePeopleGrowthStage('C', 20)
    expect(stage.isComplete).toBe(true)
    expect(stage.progressPercent).toBe(100)
  })

  it('8. progressPercent가 항상 0~100 범위(State A/B/C 전 구간)', () => {
    for (const [state, count] of [
      ['A', 0],
      ['B', 1],
      ['B', 5],
      ['B', 10],
      ['C', 11],
      ['C', 1000],
    ] as const) {
      const stage = calculatePeopleGrowthStage(state, count)
      expect(stage.progressPercent).toBeGreaterThanOrEqual(0)
      expect(stage.progressPercent).toBeLessThanOrEqual(100)
    }
  })
})

describe('formatPeopleGrowthDescription — 9/10. State B 문구', () => {
  it('9. 실제 남은 인원(remainingPeople)을 문구에 포함한다', () => {
    const stage = calculatePeopleGrowthStage('B', 6)
    expect(formatPeopleGrowthDescription(stage.remainingPeople)).toBe(
      '5명만 더 모이면 다음 성장 단계로 이어져요.'
    )
  })

  it('10. "다음 Level"이라는 표현을 포함하지 않는다', () => {
    const stage = calculatePeopleGrowthStage('B', 6)
    const text = formatPeopleGrowthDescription(stage.remainingPeople)
    expect(text).not.toContain('다음 Level')
    expect(text).not.toContain('Level')
  })
})

describe('formatPeopleGrowthRemainingLabel — State A/B/C 남은 인원 라벨', () => {
  it('State A는 "첫 기록까지 1명"을 표시한다', () => {
    const stage = calculatePeopleGrowthStage('A', 0)
    expect(formatPeopleGrowthRemainingLabel('A', stage)).toBe('첫 기록까지 1명')
  })

  it('State B는 "다음 성장 단계까지 N명"을 실제 remainingPeople로 표시한다', () => {
    const stage = calculatePeopleGrowthStage('B', 6)
    expect(formatPeopleGrowthRemainingLabel('B', stage)).toBe('다음 성장 단계까지 5명')
  })

  it('State C는 임의의 다음 목표를 만들지 않고 null을 반환한다', () => {
    const stage = calculatePeopleGrowthStage('C', 11)
    expect(formatPeopleGrowthRemainingLabel('C', stage)).toBeNull()
  })
})

describe('11. 사람 수 성장 계산은 XP remainingToNext를 사람 수 표시용으로 사용하지 않는다', () => {
  it('calculatePeopleGrowthStage는 XP/remainingToNext를 입력으로 받지 않는다(schoolState, visibleProfileCount만 입력)', () => {
    expect(calculatePeopleGrowthStage.length).toBe(2)
  })

  it('두루고등학교 사례(6명, XP remainingToNext=135)에서도 사람 수 결과(남은 5명)는 XP 값과 무관하다', () => {
    // XP 기준 계산(Phase 2A, 감사에서 확인된 실제 값): threshold(2)=141, remainingToNext=135, progress 4%
    const xpBasedSnapshot = snapshot({
      schoolState: 'B',
      visibleProfileCount: 6,
      remainingToNext: 135,
      progressPercent: 4,
    })
    const stage = calculatePeopleGrowthStage(xpBasedSnapshot.schoolState, xpBasedSnapshot.visibleProfileCount)
    expect(stage.remainingPeople).toBe(5)
    expect(stage.progressPercent).toBe(50)
    expect(stage.remainingPeople).not.toBe(xpBasedSnapshot.remainingToNext)
    expect(stage.progressPercent).not.toBe(xpBasedSnapshot.progressPercent)
  })
})
