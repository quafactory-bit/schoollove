import { describe, expect, it } from 'vitest'
import { validateCumulativeXp, compareStoredAndCalculatedLevel } from './validation'

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
