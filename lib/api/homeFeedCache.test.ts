import { afterEach, describe, expect, it, vi } from 'vitest'

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

import { revalidateHomeFeed, revalidateRegistrationContext } from './homeFeedCache'

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

describe('revalidateRegistrationContext', () => {
  it('revalidates Home and the exact School/Year/Class context once each', () => {
    revalidateRegistrationContext({
      schoolSlug: 'duru-high',
      graduationYear: 2020,
      grade: 3,
      classNumber: 2,
    })

    expect(revalidatePathMock.mock.calls.map(([path]) => path)).toEqual([
      '/',
      '/school/duru-high',
      '/school/duru-high/2020',
      '/school/duru-high/2020/3-2',
    ])
  })

  it('omits the class path when class context is absent', () => {
    revalidateRegistrationContext({
      schoolSlug: 'duru-university',
      graduationYear: 2024,
      grade: null,
      classNumber: null,
    })

    expect(revalidatePathMock.mock.calls.map(([path]) => path)).toEqual([
      '/',
      '/school/duru-university',
      '/school/duru-university/2024',
    ])
  })

  it('falls back to Home only when the server cannot resolve a school slug', () => {
    revalidateRegistrationContext({ graduationYear: 2024 })

    expect(revalidatePathMock).toHaveBeenCalledTimes(1)
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })
})
