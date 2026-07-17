import { afterEach, describe, expect, it, vi } from 'vitest'

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

import { revalidateHomeFeed } from './homeFeedCache'

afterEach(() => {
  vi.clearAllMocks()
})

describe('revalidateHomeFeed', () => {
  it('1. "/" 경로만 재검증한다', () => {
    revalidateHomeFeed()

    expect(revalidatePathMock).toHaveBeenCalledTimes(1)
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('2. revalidatePath가 예외를 던져도 호출자에게 다시 던지지 않는다(등록 응답을 되돌리지 않음)', () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error('cache error')
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => revalidateHomeFeed()).not.toThrow()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
