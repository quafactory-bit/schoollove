import { describe, expect, it } from 'vitest'
import {
  validateCumulativeXp,
  compareStoredAndCalculatedLevel,
  describeSyncResult,
} from './validation'

describe('validateCumulativeXp', () => {
  it('빈 문자열은 에러 없이 value null (미입력 상태)', () => {
    expect(validateCumulativeXp('')).toEqual({ value: null, error: null })
    expect(validateCumulativeXp('   ')).toEqual({ value: null, error: null })
  })

  it('0 이상의 정수는 유효하다', () => {
    expect(validateCumulativeXp('0')).toEqual({ value: 0, error: null })
    expect(validateCumulativeXp('141')).toEqual({ value: 141, error: null })
  })

  it('음수는 거부된다', () => {
    const result = validateCumulativeXp('-1')
    expect(result.value).toBeNull()
    expect(result.error).not.toBeNull()
  })

  it('소수는 거부된다', () => {
    const result = validateCumulativeXp('1.5')
    expect(result.value).toBeNull()
    expect(result.error).not.toBeNull()
  })

  it('숫자가 아닌 입력은 거부된다', () => {
    const result = validateCumulativeXp('abc')
    expect(result.value).toBeNull()
    expect(result.error).not.toBeNull()
  })

  it('safe integer 범위를 초과하면 거부된다', () => {
    const tooLarge = String(Number.MAX_SAFE_INTEGER + 1)
    const result = validateCumulativeXp(tooLarge)
    expect(result.value).toBeNull()
    expect(result.error).not.toBeNull()
  })

  it('safe integer 최댓값은 허용된다', () => {
    const result = validateCumulativeXp(String(Number.MAX_SAFE_INTEGER))
    expect(result.value).toBe(Number.MAX_SAFE_INTEGER)
    expect(result.error).toBeNull()
  })
})

describe('compareStoredAndCalculatedLevel', () => {
  it('storedLevel이 null이면 uninitialized', () => {
    expect(compareStoredAndCalculatedLevel(null, 1)).toBe('uninitialized')
  })

  it('계산 Level이 저장 Level보다 크면 increase', () => {
    expect(compareStoredAndCalculatedLevel(2, 3)).toBe('increase')
  })

  it('계산 Level이 저장 Level과 같으면 same', () => {
    expect(compareStoredAndCalculatedLevel(2, 2)).toBe('same')
  })

  it('계산 Level이 저장 Level보다 작으면 lower', () => {
    expect(compareStoredAndCalculatedLevel(3, 2)).toBe('lower')
  })
})

describe('describeSyncResult', () => {
  it('h. before null → after 유효값: 최초 초기화', () => {
    const label = describeSyncResult(
      { current_level: null, level_updated_at: null },
      { current_level: 1, level_updated_at: null }
    )
    expect(label).toBe('최초 초기화')
  })

  it('h. before < after(둘 다 유효): 실제 저장 Level 상승', () => {
    const label = describeSyncResult(
      { current_level: 2, level_updated_at: null },
      { current_level: 3, level_updated_at: '2026-01-01T00:00:00.000Z' }
    )
    expect(label).toBe('실제 저장 Level 상승')
  })

  it('i. before === after(동일 Level): 저장 Level 변경 없음 (성공으로 명확히 표시, 에러 아님)', () => {
    const label = describeSyncResult(
      { current_level: 3, level_updated_at: '2026-01-01T00:00:00.000Z' },
      { current_level: 3, level_updated_at: '2026-01-01T00:00:00.000Z' }
    )
    expect(label).toBe('저장 Level 변경 없음')
  })

  it('j. before > after(계산값이 더 낮아 실제로는 다운그레이드되지 않은 경우): 저장 Level 변경 없음', () => {
    // resolveLevelUpdate가 downgrade를 절대 허용하지 않으므로 after.current_level은
    // 실제로 before보다 낮아질 수 없다 — 이 케이스는 "낮은 계산값 재시도"가
    // 저장 Level을 그대로 반환한 경우(before === after)를 의미한다.
    const label = describeSyncResult(
      { current_level: 4, level_updated_at: '2026-01-01T00:00:00.000Z' },
      { current_level: 4, level_updated_at: '2026-01-01T00:00:00.000Z' }
    )
    expect(label).toBe('저장 Level 변경 없음')
  })

  it('방어적 edge case — before/after 둘 다 null(실제 route 응답으로는 발생하지 않음): 저장 Level 변경 없음', () => {
    const label = describeSyncResult(
      { current_level: null, level_updated_at: null },
      { current_level: null, level_updated_at: null }
    )
    expect(label).toBe('저장 Level 변경 없음')
  })
})
