import { describe, expect, it } from 'vitest'
import { calculateSchoolGrowthSnapshot, classifySchoolState } from './schoolGrowth'
import { calculateLevelState } from './levelPolicy'

const BASE = {
  schoolId: 'school-1',
  schoolName: '테스트고등학교',
  slug: 'test-high',
  levelUpdatedAt: null as string | null,
}

describe('calculateSchoolGrowthSnapshot', () => {
  it('a. 공개 프로필 0명 → State A, calculatedLevel 1, remainingToNext은 실제 curve 값 그대로(UI 카피로 대체하지 않음)', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: 0,
      storedCurrentLevel: null,
    })

    expect(snapshot.schoolState).toBe('A')
    expect(snapshot.calculatedLevel).toBe(1)
    expect(snapshot.effectiveLevel).toBe(1)
    expect(snapshot.remainingToNext).toBe(calculateLevelState(0).remainingToNext)
    expect(snapshot.remainingToNext).toBeGreaterThan(1) // §7의 "다음 레벨까지 1명"은 UI 카피일 뿐, 실제 값은 curve 그대로
    expect(snapshot.progressPercent).toBe(0)
  })

  it('b. Level 1 기본 상태(소수 인원) → calculatedLevel 1 유지', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: 5,
      storedCurrentLevel: null,
    })

    expect(snapshot.calculatedLevel).toBe(1)
    expect(snapshot.schoolState).toBe('B')
  })

  it('c. Level 임계값 직전(threshold(2)-1) → 아직 Level 1', () => {
    const threshold2 = calculateLevelState(141).level === 2 ? 141 : 141 // threshold(2) = round(50*2^1.5) = 141
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: threshold2 - 1,
      storedCurrentLevel: null,
    })

    expect(snapshot.calculatedLevel).toBe(1)
  })

  it('d. Level 임계값 정확히 도달(threshold(2)=141) → Level 2', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: 141,
      storedCurrentLevel: null,
    })

    expect(snapshot.calculatedLevel).toBe(2)
    expect(snapshot.effectiveLevel).toBe(2)
  })

  it('e. 임계값 초과 → 다음 Level로 정확히 전환', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: 142,
      storedCurrentLevel: null,
    })

    expect(snapshot.calculatedLevel).toBe(2)
    expect(snapshot.remainingToNext).toBeGreaterThan(0)
  })

  it('f. 저장 Level이 계산 Level보다 높으면 effectiveLevel은 저장값 유지(하락 없음)', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: 0, // calculatedLevel = 1
      storedCurrentLevel: 5,
    })

    expect(snapshot.calculatedLevel).toBe(1)
    expect(snapshot.effectiveLevel).toBe(5) // 저장값 우선, 절대 5 미만으로 내려가지 않음
    expect(snapshot.storedCurrentLevel).toBe(5)
  })

  it('g. current_level null → storedCurrentLevel은 null 그대로, effectiveLevel은 계산값 사용', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: 20,
      storedCurrentLevel: null,
    })

    expect(snapshot.storedCurrentLevel).toBeNull()
    expect(snapshot.effectiveLevel).toBe(snapshot.calculatedLevel)
  })

  it('h. hidden profile 제외 — 호출자가 이미 제외한 visibleProfileCount만 반영(음수/비정상 입력은 0으로 clamp)', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: -3,
      storedCurrentLevel: null,
    })

    expect(snapshot.visibleProfileCount).toBe(0)
    expect(snapshot.calculatedLevel).toBe(1)
  })

  it('i. 다음 Level까지 남은 인원 계산은 calculateLevelState와 정확히 일치', () => {
    const count = 300
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: count,
      storedCurrentLevel: null,
    })
    const expected = calculateLevelState(count)

    expect(snapshot.remainingToNext).toBe(expected.remainingToNext)
    expect(snapshot.nextLevel).toBe(expected.level + 1)
    expect(snapshot.nextLevelThreshold).toBe(expected.xpForNextLevel)
  })

  it('j. progressPercent는 항상 0~100 범위(임계값 근접/초과 다양한 값에서)', () => {
    for (const count of [0, 1, 50, 140, 141, 142, 1000, 999999]) {
      const snapshot = calculateSchoolGrowthSnapshot({
        ...BASE,
        visibleProfileCount: count,
        storedCurrentLevel: null,
      })
      expect(snapshot.progressPercent).toBeGreaterThanOrEqual(0)
      expect(snapshot.progressPercent).toBeLessThanOrEqual(100)
    }
  })

  it('k. 최대 Level 처리 — 매우 큰 인원에서도 예외 없이 계산되고 값이 유효함', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: 50_000_000,
      storedCurrentLevel: null,
    })

    expect(snapshot.calculatedLevel).toBeGreaterThan(1)
    expect(snapshot.remainingToNext).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(snapshot.progressPercent)).toBe(true)
  })

  it('effectiveLevel은 계산값과 저장값 중 더 큰 쪽 — 저장값이 계산값 이하이면 계산값 사용', () => {
    const snapshot = calculateSchoolGrowthSnapshot({
      ...BASE,
      visibleProfileCount: 300, // calculatedLevel = 3
      storedCurrentLevel: 2,
    })

    expect(snapshot.effectiveLevel).toBe(snapshot.calculatedLevel)
  })

  it('isNearLevelUp은 remainingToNext <= 2일 때만 true (03-level-policy.md §7)', () => {
    // threshold(2) = 141, threshold(3) = 260 → remainingToNext가 1~2가 되는 지점 근처를 확인
    const near = calculateSchoolGrowthSnapshot({ ...BASE, visibleProfileCount: 259, storedCurrentLevel: null })
    const notNear = calculateSchoolGrowthSnapshot({ ...BASE, visibleProfileCount: 0, storedCurrentLevel: null })

    expect(near.remainingToNext).toBeLessThanOrEqual(2)
    expect(near.isNearLevelUp).toBe(true)
    expect(notNear.remainingToNext).toBeGreaterThan(2)
    expect(notNear.isNearLevelUp).toBe(false)
  })
})

describe('classifySchoolState — l. School State A/B/C 경계 (03-level-policy.md §5)', () => {
  it('0명 → A', () => {
    expect(classifySchoolState(0)).toBe('A')
  })

  it('1명, 10명 → B (1~10명 경계)', () => {
    expect(classifySchoolState(1)).toBe('B')
    expect(classifySchoolState(10)).toBe('B')
  })

  it('11명 이상 → C', () => {
    expect(classifySchoolState(11)).toBe('C')
    expect(classifySchoolState(1000)).toBe('C')
  })
})
