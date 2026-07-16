import { afterEach, describe, expect, it, vi } from 'vitest'

// lib/api/schools.test.ts와 동일한 패턴: 모듈 top-level에서 env를 읽어 client 생성 여부를
// 결정하므로, env를 바꿀 때마다 vi.resetModules() + 동적 import로 다시 평가시킨다.

const { fromEnvMock, incrMock, getMock } = vi.hoisted(() => ({
  fromEnvMock: vi.fn(),
  incrMock: vi.fn(),
  getMock: vi.fn(),
}))

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: fromEnvMock,
  },
}))

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111'

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('lib/api/views — Upstash 환경변수 누락 방어 (SchoolPage /pipeline 오류 수정)', () => {
  it('1. URL/TOKEN 모두 없음 → Redis.fromEnv 호출 안 함, incrSchoolView는 0 반환', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { incrSchoolView } = await import('./views')
    const result = await incrSchoolView(SCHOOL_ID)

    expect(result).toBe(0)
    expect(fromEnvMock).not.toHaveBeenCalled()
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    consoleWarnSpy.mockRestore()
  })

  it('2. URL만 있고 TOKEN 없음 → Redis.fromEnv 호출 안 함, getSchoolView는 0 반환', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getSchoolView } = await import('./views')
    const result = await getSchoolView(SCHOOL_ID)

    expect(result).toBe(0)
    expect(fromEnvMock).not.toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  it('3. TOKEN만 있고 URL 없음 → Redis.fromEnv 호출 안 함, incrSchoolView는 0 반환', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { incrSchoolView } = await import('./views')
    const result = await incrSchoolView(SCHOOL_ID)

    expect(result).toBe(0)
    expect(fromEnvMock).not.toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  it('4. 렌더 1회 안에서 여러 번 호출돼도 경고는 한 번만 출력됨 (렌더마다 반복 경고 방지)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { incrSchoolView, getSchoolView } = await import('./views')
    await incrSchoolView(SCHOOL_ID)
    await getSchoolView(SCHOOL_ID)
    await incrSchoolView(SCHOOL_ID)

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    consoleWarnSpy.mockRestore()
  })

  it('5. URL/TOKEN 모두 있음 → 기존처럼 Redis.fromEnv로 만든 client의 incr/get이 그대로 사용됨', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    fromEnvMock.mockReturnValue({ incr: incrMock, get: getMock })
    incrMock.mockResolvedValue(5)
    getMock.mockResolvedValue(3)

    const { incrSchoolView, getSchoolView } = await import('./views')

    const incrResult = await incrSchoolView(SCHOOL_ID)
    const getResult = await getSchoolView(SCHOOL_ID)

    expect(fromEnvMock).toHaveBeenCalledTimes(1)
    expect(incrMock).toHaveBeenCalledWith(`schoollove:views:school:${SCHOOL_ID}`)
    expect(getMock).toHaveBeenCalledWith(`schoollove:views:school:${SCHOOL_ID}`)
    expect(incrResult).toBe(5)
    expect(getResult).toBe(3)
  })

  it('6. env가 정상인데 client가 실제로 던지는 에러는 기존처럼 삼켜지고 0을 반환함', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    fromEnvMock.mockReturnValue({ incr: incrMock, get: getMock })
    incrMock.mockRejectedValue(new TypeError('Failed to parse URL from /pipeline'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { incrSchoolView } = await import('./views')
    const result = await incrSchoolView(SCHOOL_ID)

    expect(result).toBe(0)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
