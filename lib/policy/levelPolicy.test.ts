import { describe, expect, it } from 'vitest'
import { calculateLevelState } from './levelPolicy'

// docs/design-package-v1.0/03-level-policy.md §3 기준 고정 경계값.
// production 코드의 공식을 재구현하지 않고 스펙 기준 상수로 명시한다.
const T2 = 141
const T3 = 260
const T4 = 400

describe('calculateLevelState', () => {
  it('cumulativeXp = 0이면 Level 1 시작 상태를 반환한다', () => {
    const state = calculateLevelState(0)
    expect(state.level).toBe(1)
    expect(state.xpIntoLevel).toBe(0)
    expect(state.xpForNextLevel).toBe(T2)
    expect(state.remainingToNext).toBe(T2)
  })

  it('cumulativeXp = 1이면 Level 1 유지, 진행값만 증가한다', () => {
    const state = calculateLevelState(1)
    expect(state.level).toBe(1)
    expect(state.xpIntoLevel).toBe(1)
    expect(state.remainingToNext).toBe(T2 - 1)
  })

  it('threshold(2) 직전에는 아직 Level 1이고 remainingToNext = 1이다', () => {
    const state = calculateLevelState(T2 - 1)
    expect(state.level).toBe(1)
    expect(state.xpIntoLevel).toBe(T2 - 1)
    expect(state.remainingToNext).toBe(1)
  })

  it('threshold(2)에 정확히 도달하면 Level 2로 올라간다', () => {
    const state = calculateLevelState(T2)
    expect(state.level).toBe(2)
    expect(state.xpIntoLevel).toBe(0)
    expect(state.xpForNextLevel).toBe(T3 - T2)
    expect(state.remainingToNext).toBe(T3 - T2)
  })

  it('threshold(3) 직전에는 아직 Level 2이고 remainingToNext = 1이다', () => {
    const state = calculateLevelState(T3 - 1)
    expect(state.level).toBe(2)
    expect(state.xpIntoLevel).toBe(T3 - 1 - T2)
    expect(state.remainingToNext).toBe(1)
  })

  it('threshold(3)에 정확히 도달하면 Level 3으로 올라간다', () => {
    const state = calculateLevelState(T3)
    expect(state.level).toBe(3)
    expect(state.xpIntoLevel).toBe(0)
    expect(state.xpForNextLevel).toBe(T4 - T3)
    expect(state.remainingToNext).toBe(T4 - T3)
  })

  it('매우 큰 cumulativeXp에서도 안전하고 일관된 상태를 반환한다', () => {
    const state = calculateLevelState(Number.MAX_SAFE_INTEGER)
    expect(state.level).toBeGreaterThan(1)
    expect(Number.isFinite(state.level)).toBe(true)
    expect(state.xpIntoLevel).toBeGreaterThanOrEqual(0)
    expect(state.xpIntoLevel).toBeLessThan(state.xpForNextLevel)
    expect(state.remainingToNext).toBeGreaterThanOrEqual(1)
  })

  it('음수 cumulativeXp는 Level 1, xpIntoLevel 0으로 안전하게 클램프된다', () => {
    for (const negative of [-1, -100, -1000000, -Infinity]) {
      const state = calculateLevelState(negative)
      expect(state.level).toBe(1)
      expect(state.xpIntoLevel).toBe(0)
      expect(state.remainingToNext).toBe(T2)
    }
  })

  it('NaN이나 +Infinity 같은 비정상 입력도 음수 레벨을 만들지 않는다', () => {
    const nanState = calculateLevelState(NaN)
    expect(nanState.level).toBe(1)
    expect(Number.isFinite(nanState.remainingToNext)).toBe(true)

    const infState = calculateLevelState(Infinity)
    expect(infState.level).toBe(1)
    expect(Number.isFinite(infState.remainingToNext)).toBe(true)
  })

  it('모든 결과에서 level >= 1이다', () => {
    const samples = [-1e9, -1, 0, 1, 140, 141, 259, 260, 1e6, Number.MAX_SAFE_INTEGER]
    for (const xp of samples) {
      expect(calculateLevelState(xp).level).toBeGreaterThanOrEqual(1)
    }
  })

  it('모든 결과에서 remainingToNext >= 1인 정수다', () => {
    const samples = [-1e9, -1, 0, 1, 140, 141, 259, 260, 1e6, Number.MAX_SAFE_INTEGER]
    for (const xp of samples) {
      const { remainingToNext } = calculateLevelState(xp)
      expect(remainingToNext).toBeGreaterThanOrEqual(1)
      expect(Number.isInteger(remainingToNext)).toBe(true)
    }
  })
})
