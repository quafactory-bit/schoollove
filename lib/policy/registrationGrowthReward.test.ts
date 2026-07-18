import { describe, expect, it } from 'vitest'
import { classifyRegistrationGrowthOutcome } from './registrationGrowthReward'
import type { RegistrationGrowthSnapshot } from '@/types/registration'

// 순수 함수 단위 테스트 — DB 접근 없음. before/after 스냅샷은 여기서 직접 구성한다
// (calculateSchoolGrowthSnapshot의 실제 계산은 lib/policy/schoolGrowth.test.ts가 담당).
function snapshot(overrides: Partial<RegistrationGrowthSnapshot> = {}): RegistrationGrowthSnapshot {
  return {
    visibleProfileCount: 5,
    effectiveLevel: 1,
    nextLevel: 2,
    remainingToNext: 3,
    progressPercent: 40,
    isNearLevelUp: false,
    ...overrides,
  }
}

describe('classifyRegistrationGrowthOutcome', () => {
  it('1. level_up — effectiveLevel이 올랐으면 level_up', () => {
    const before = snapshot({ visibleProfileCount: 140, effectiveLevel: 1 })
    const after = snapshot({ visibleProfileCount: 141, effectiveLevel: 2 })

    expect(classifyRegistrationGrowthOutcome(before, after)).toBe('level_up')
  })

  it('2. first_record — 0명에서 1명 이상으로, 레벨은 그대로면 first_record', () => {
    const before = snapshot({ visibleProfileCount: 0, effectiveLevel: 1 })
    const after = snapshot({ visibleProfileCount: 1, effectiveLevel: 1 })

    expect(classifyRegistrationGrowthOutcome(before, after)).toBe('first_record')
  })

  it('3. progress — count만 늘고 레벨은 동일하면 progress', () => {
    const before = snapshot({ visibleProfileCount: 3, effectiveLevel: 1 })
    const after = snapshot({ visibleProfileCount: 4, effectiveLevel: 1 })

    expect(classifyRegistrationGrowthOutcome(before, after)).toBe('progress')
  })

  it('4. no_change — count가 동일하면 no_change', () => {
    const before = snapshot({ visibleProfileCount: 5, effectiveLevel: 1 })
    const after = snapshot({ visibleProfileCount: 5, effectiveLevel: 1 })

    expect(classifyRegistrationGrowthOutcome(before, after)).toBe('no_change')
  })

  it('5. no_change — count가 줄어도(신고 숨김 등) no_change', () => {
    const before = snapshot({ visibleProfileCount: 5, effectiveLevel: 1 })
    const after = snapshot({ visibleProfileCount: 3, effectiveLevel: 1 })

    expect(classifyRegistrationGrowthOutcome(before, after)).toBe('no_change')
  })

  it('6. level_up과 first_record가 동시에 참이면 level_up이 우선한다', () => {
    // 저장 레벨이 계산값보다 높게 고정된 드문 경우를 흉내: before가 count=0인데도
    // effectiveLevel이 이미 2(저장값 우선)이고, after는 count가 늘면서 effectiveLevel도 3으로 오름.
    const before = snapshot({ visibleProfileCount: 0, effectiveLevel: 2 })
    const after = snapshot({ visibleProfileCount: 1, effectiveLevel: 3 })

    expect(classifyRegistrationGrowthOutcome(before, after)).toBe('level_up')
  })

  it('7. 레벨은 같고 count만 증가하면 progress (level_up/first_record 아님)', () => {
    const before = snapshot({ visibleProfileCount: 20, effectiveLevel: 2 })
    const after = snapshot({ visibleProfileCount: 21, effectiveLevel: 2 })

    expect(classifyRegistrationGrowthOutcome(before, after)).toBe('progress')
  })

  it('8. count 증가가 없어도 level이 증가하면 level_up', () => {
    const before = snapshot({ visibleProfileCount: 10, effectiveLevel: 1 })
    const after = snapshot({ visibleProfileCount: 10, effectiveLevel: 2 })

    expect(classifyRegistrationGrowthOutcome(before, after)).toBe('level_up')
  })
})
