import { describe, expect, it } from 'vitest'
import { resolveLevelUpdate } from './levelPersistence'
import type { LevelState } from '@/types/level'

function stateAtLevel(level: number): LevelState {
  return {
    level,
    xpIntoLevel: 0,
    xpForNextLevel: 1,
    remainingToNext: 1,
  }
}

describe('resolveLevelUpdate', () => {
  it('storedLevel = 1, new level = 1이면 변경 없음', () => {
    const decision = resolveLevelUpdate(1, stateAtLevel(1))
    expect(decision).toEqual({ level: 1, shouldPersistLevel: false, levelIncreased: false })
  })

  it('storedLevel = 2, new level = 1이면 하락을 막고 변경 없음', () => {
    const decision = resolveLevelUpdate(2, stateAtLevel(1))
    expect(decision).toEqual({ level: 2, shouldPersistLevel: false, levelIncreased: false })
  })

  it('storedLevel = 2, new level = 2이면 변경 없음', () => {
    const decision = resolveLevelUpdate(2, stateAtLevel(2))
    expect(decision).toEqual({ level: 2, shouldPersistLevel: false, levelIncreased: false })
  })

  it('storedLevel = 2, new level = 3이면 상승한다', () => {
    const decision = resolveLevelUpdate(2, stateAtLevel(3))
    expect(decision).toEqual({ level: 3, shouldPersistLevel: true, levelIncreased: true })
  })

  it('storedLevel = 10, new level = 11이면 상승한다', () => {
    const decision = resolveLevelUpdate(10, stateAtLevel(11))
    expect(decision).toEqual({ level: 11, shouldPersistLevel: true, levelIncreased: true })
  })

  it('storedLevel = null, new level = 1이면 초기화 저장이지만 levelIncreased는 false다', () => {
    const decision = resolveLevelUpdate(null, stateAtLevel(1))
    expect(decision).toEqual({ level: 1, shouldPersistLevel: true, levelIncreased: false })
  })

  it('storedLevel = null, new level = 5이면 초기화 저장이지만 levelIncreased는 false다', () => {
    const decision = resolveLevelUpdate(null, stateAtLevel(5))
    expect(decision).toEqual({ level: 5, shouldPersistLevel: true, levelIncreased: false })
  })

  it('상승하지 않은 케이스에서는 levelIncreased가 모두 false다', () => {
    const noIncreaseCases = [
      resolveLevelUpdate(1, stateAtLevel(1)),
      resolveLevelUpdate(2, stateAtLevel(1)),
      resolveLevelUpdate(2, stateAtLevel(2)),
      resolveLevelUpdate(null, stateAtLevel(1)),
      resolveLevelUpdate(null, stateAtLevel(5)),
    ]
    for (const decision of noIncreaseCases) {
      expect(decision.levelIncreased).toBe(false)
    }
  })

  it('실제 상승 케이스에서만 levelIncreased가 true다', () => {
    const increaseCases = [
      resolveLevelUpdate(2, stateAtLevel(3)),
      resolveLevelUpdate(10, stateAtLevel(11)),
    ]
    for (const decision of increaseCases) {
      expect(decision.levelIncreased).toBe(true)
    }
  })
})
