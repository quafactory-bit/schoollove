import { describe, expect, it } from 'vitest'
import { isAllFailed, resultHeading } from './resultText'

describe('isAllFailed', () => {
  it('성공 0명 + 실패 1명 이상 = 전체 실패', () => {
    expect(isAllFailed({ success: 0, dup: 0, fail: 1 })).toBe(true)
    expect(isAllFailed({ success: 0, dup: 2, fail: 3 })).toBe(true)
  })

  it('성공 1명 이상이면 실패 건수와 무관하게 전체 실패가 아님 (부분 성공)', () => {
    expect(isAllFailed({ success: 1, dup: 0, fail: 2 })).toBe(false)
    expect(isAllFailed({ success: 3, dup: 0, fail: 0 })).toBe(false)
  })

  it('성공 0명 + 실패 0명(중복만 있는 경우)은 전체 실패가 아님', () => {
    expect(isAllFailed({ success: 0, dup: 2, fail: 0 })).toBe(false)
  })
})

describe('resultHeading', () => {
  it('전체 성공 → 기존 완료 문구 유지', () => {
    expect(resultHeading(false, { success: 3, dup: 0, fail: 0 })).toBe('등록 완료!')
    expect(resultHeading(true, { success: 1, dup: 0, fail: 0 })).toBe('연결 완료!')
  })

  it('부분 성공(성공 1명 이상 + 실패 존재) → 기존 완료 문구 유지', () => {
    expect(resultHeading(false, { success: 2, dup: 0, fail: 1 })).toBe('등록 완료!')
    expect(resultHeading(true, { success: 1, dup: 1, fail: 1 })).toBe('연결 완료!')
  })

  it('전체 실패(성공 0명 + 실패 1명 이상) → 완료 문구를 쓰지 않음', () => {
    expect(resultHeading(false, { success: 0, dup: 0, fail: 1 })).toBe('등록하지 못했어요')
    expect(resultHeading(true, { success: 0, dup: 0, fail: 1 })).toBe('연결하지 못했어요')
  })
})
