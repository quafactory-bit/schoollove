import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { ratelimitLimitMock } = vi.hoisted(() => ({
  ratelimitLimitMock: vi.fn(),
}))

const { fromMock, insertMock, selectMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectMock = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectMock }))
  const fromMock = vi.fn(() => ({ insert: insertMock }))
  return { fromMock, insertMock, selectMock, singleMock }
})

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow(...args: unknown[]) {
      return args
    }
    limit = ratelimitLimitMock
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({}) },
}))

vi.mock('@/lib/supabase', () => ({
  supabaseServer: { from: fromMock },
}))

vi.mock('@/lib/api/profiles', () => ({
  getSchoolProfileCount: vi.fn(),
}))

vi.mock('@/lib/api/levels', () => ({
  syncSchoolLevel: vi.fn(),
}))

import { POST } from './route'
import { getSchoolProfileCount } from '@/lib/api/profiles'
import { syncSchoolLevel } from '@/lib/api/levels'

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111'

const VALID_BODY = {
  school_id: SCHOOL_ID,
  graduation_year: 2015,
  grade: 3,
  class_number: 2,
  department: null,
  student_year: null,
  nickname: '홍길동',
  instagram_id: 'gildong',
  is_self: true,
  message: '보고싶다',
}

function allowRateLimit() {
  ratelimitLimitMock.mockResolvedValue({
    success: true,
    limit: 20,
    remaining: 19,
    reset: 0,
  })
}

function createRequest(options: { body?: unknown; invalidJson?: boolean }): NextRequest {
  const fake = {
    headers: { get: (_name: string) => null },
    json: async () => {
      if (options.invalidJson) throw new SyntaxError('Unexpected token')
      return options.body
    },
  }
  return fake as unknown as NextRequest
}

beforeEach(() => {
  // 기본값: Upstash가 설정된 상태(configured)로 두어 기존 rate limit 동작을 그대로 검증한다.
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  allowRateLimit()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('POST /api/profiles', () => {
  it('1. rate limit 초과 → 429, insert/Level Sync 호출 안 함 (기존 rate limit 동작 유지)', async () => {
    ratelimitLimitMock.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: 60 })
    const request = createRequest({ body: VALID_BODY })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json).toEqual({ error: '잠시 후 다시 시도해주세요. (요청 한도 초과)' })
    expect(fromMock).not.toHaveBeenCalled()
    expect(getSchoolProfileCount).not.toHaveBeenCalled()
    expect(syncSchoolLevel).not.toHaveBeenCalled()
  })

  it('2. JSON 파싱 실패 → 400 (기존 오류 응답 유지)', async () => {
    const request = createRequest({ invalidJson: true })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '잘못된 요청입니다.' })
  })

  it('3. school_id가 UUID가 아님 → 400 Invalid input (기존 validation 유지)', async () => {
    const request = createRequest({ body: { ...VALID_BODY, school_id: 'not-a-uuid' } })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '입력값이 올바르지 않습니다.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('4. nickname 누락 → 400 Invalid input (기존 validation 유지)', async () => {
    const { nickname: _nickname, ...withoutNickname } = VALID_BODY
    const request = createRequest({ body: withoutNickname })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '입력값이 올바르지 않습니다.' })
  })

  it('5. graduation_year 1970/2032 경계값 → validation 통과 (submit 페이지 YEARS 드롭다운 실제 범위와 일치)', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    const early = await POST(createRequest({ body: { ...VALID_BODY, graduation_year: 1970 } }))
    expect(early.status).toBe(201)

    const late = await POST(createRequest({ body: { ...VALID_BODY, graduation_year: 2032 } }))
    expect(late.status).toBe(201)
  })

  it('6. 프로필 insert 실패(중복, 23505) → 409, Level Sync 미호출', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })
    const request = createRequest({ body: VALID_BODY })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json).toEqual({ error: '이미 등록된 정보입니다.' })
    expect(getSchoolProfileCount).not.toHaveBeenCalled()
    expect(syncSchoolLevel).not.toHaveBeenCalled()
  })

  it('7. 프로필 insert 실패(기타 DB 오류) → 500, Level Sync 미호출', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: '500', message: 'db down' } })
    const request = createRequest({ body: VALID_BODY })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: '등록 중 오류가 발생했습니다.' })
    expect(getSchoolProfileCount).not.toHaveBeenCalled()
    expect(syncSchoolLevel).not.toHaveBeenCalled()
  })

  it('8. 정상 등록 성공 → 프로필 수 조회 → syncSchoolLevel 호출, cumulativeXp는 insert 후 실제 프로필 수', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1', ...VALID_BODY }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(7)
    vi.mocked(syncSchoolLevel).mockResolvedValue({ id: SCHOOL_ID, current_level: 2, level_updated_at: null })

    const request = createRequest({ body: VALID_BODY })
    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(getSchoolProfileCount).toHaveBeenCalledWith(SCHOOL_ID)
    expect(syncSchoolLevel).toHaveBeenCalledWith(SCHOOL_ID, 7)
  })

  it('9. 등록 성공 응답은 Level Sync 성공 여부와 무관하게 201 + { data } (새 필드 추가 없음)', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(3)
    vi.mocked(syncSchoolLevel).mockResolvedValue({ id: SCHOOL_ID, current_level: 1, level_updated_at: null })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'p1' } })
  })

  it('10. Level Sync 실패(syncSchoolLevel null 반환)에도 등록 성공 응답 201 유지', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(5)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'p1' } })
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('11. Level Sync가 예외를 던져도 등록 성공 응답 201 유지 (getSchoolProfileCount throw)', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockRejectedValue(new Error('supabase unreachable'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'p1' } })
    expect(syncSchoolLevel).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('12. is_self, message가 정상적으로 insert 페이로드에 전달됨', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    await POST(createRequest({ body: { ...VALID_BODY, is_self: true, message: '보고싶다' } }))

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        school_id: SCHOOL_ID,
        nickname: '홍길동',
        instagram_id: 'gildong',
        is_self: true,
        message: '보고싶다',
      })
    )
  })

  it('13. is_self 미전달 시 false로 저장됨 (친구 등록 기본값)', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)
    const { is_self: _isSelf, ...withoutIsSelf } = VALID_BODY

    await POST(createRequest({ body: withoutIsSelf }))

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ is_self: false }))
  })

  it('14. message가 30자 초과 → 400 Invalid input (submit 페이지 maxLength=30과 일치)', async () => {
    const request = createRequest({ body: { ...VALID_BODY, message: 'a'.repeat(31) } })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '입력값이 올바르지 않습니다.' })
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/profiles — Upstash rate limit 환경변수 누락 처리', () => {
  it('15. development 환경 + Upstash 환경변수 없음 → 500이 아니며 insert까지 정상 진행', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'p1' } })
    expect(ratelimitLimitMock).not.toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  it('16. production 환경 + Upstash 환경변수 없음 → 500 서버 설정 오류, insert 미호출 (설정 누락을 우회하지 않음)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: '서버 설정 오류입니다.' })
    expect(fromMock).not.toHaveBeenCalled()
    expect(ratelimitLimitMock).not.toHaveBeenCalled()
    expect(getSchoolProfileCount).not.toHaveBeenCalled()
    expect(syncSchoolLevel).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('17. production + Upstash 환경변수 정상 설정 → 기존처럼 실제 rate limit이 그대로 적용됨 (보안 경계 약화 없음)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    // beforeEach가 이미 UPSTASH_REDIS_REST_URL/TOKEN을 설정해둔 상태(configured)
    ratelimitLimitMock.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: 60 })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json).toEqual({ error: '잠시 후 다시 시도해주세요. (요청 한도 초과)' })
    expect(fromMock).not.toHaveBeenCalled()
  })
})
