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
  getSchoolLevelSnapshot: vi.fn(),
}))

const { getSchoolByIdMock } = vi.hoisted(() => ({
  getSchoolByIdMock: vi.fn(),
}))

vi.mock('@/lib/api/schools', () => ({
  getSchoolById: getSchoolByIdMock,
}))

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

// PHASE 9 — verifyCaptchaToken은 이 파일에서 항상 mock으로 대체한다(실제 Cloudflare
// 네트워크 검증은 lib/security/captcha.test.ts가 전담). 기본값은 성공 — 이렇게 해야
// captchaToken 자체를 다루지 않는 기존 43개 테스트가 계속 통과한다(약화 아님, mock으로
// 항상 통과하는 CAPTCHA 관문을 하나 더 거치는 것뿐, 그 외 검증 로직은 무변경).
const { verifyCaptchaTokenMock } = vi.hoisted(() => ({
  verifyCaptchaTokenMock: vi.fn(),
}))

vi.mock('@/lib/security/captcha', () => ({
  verifyCaptchaToken: verifyCaptchaTokenMock,
}))

import { POST } from './route'
import { getSchoolProfileCount } from '@/lib/api/profiles'
import { syncSchoolLevel, getSchoolLevelSnapshot } from '@/lib/api/levels'

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
  captchaToken: 'valid-turnstile-token',
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
  // 기본값: CAPTCHA 검증 성공. 개별 테스트에서 필요할 때만 실패로 덮어쓴다.
  verifyCaptchaTokenMock.mockResolvedValue({ verified: true })
  getSchoolByIdMock.mockResolvedValue(null)
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

  it('12-2. INSERT payload는 사용자 입력만 유지하고 DB 기본값·보호 컬럼과 captchaToken을 보내지 않음', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    await POST(createRequest({ body: VALID_BODY }))

    const insertPayload = (insertMock.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(insertPayload).toEqual({
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
    })
    expect(insertPayload).not.toHaveProperty('report_count')
    expect(insertPayload).not.toHaveProperty('is_hidden')
    expect(insertPayload).not.toHaveProperty('captchaToken')
    expect(insertPayload).not.toHaveProperty('id')
    expect(insertPayload).not.toHaveProperty('created_at')
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

describe('POST /api/profiles — 배치/재시도 데이터 정합성 (Phase 2)', () => {
  it('d. 같은 학교에 신규 성공 요청이 2건 연속되면 syncSchoolLevel도 정확히 2번, 각 호출 시점의 실제 프로필 수로 호출됨', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValueOnce(5).mockResolvedValueOnce(6)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    const first = await POST(createRequest({ body: { ...VALID_BODY, nickname: '첫번째' } }))
    const second = await POST(createRequest({ body: { ...VALID_BODY, nickname: '두번째' } }))

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(syncSchoolLevel).toHaveBeenCalledTimes(2)
    expect(syncSchoolLevel).toHaveBeenNthCalledWith(1, SCHOOL_ID, 5)
    expect(syncSchoolLevel).toHaveBeenNthCalledWith(2, SCHOOL_ID, 6)
  })

  it('g. 재시도 시나리오: 동일 등록이 성공 후 중복으로 재시도되면 syncSchoolLevel은 최초 성공 1회만 호출됨 (Level 중복 반영 없음)', async () => {
    singleMock
      .mockResolvedValueOnce({ data: { id: 'p1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(3)
    vi.mocked(syncSchoolLevel).mockResolvedValue({ id: SCHOOL_ID, current_level: 1, level_updated_at: null })

    const firstAttempt = await POST(createRequest({ body: VALID_BODY }))
    const retryAttempt = await POST(createRequest({ body: VALID_BODY }))

    expect(firstAttempt.status).toBe(201)
    expect(retryAttempt.status).toBe(409)
    expect(getSchoolProfileCount).toHaveBeenCalledTimes(1)
    expect(syncSchoolLevel).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/profiles — 홈 피드 재검증 계약 (Phase 4B, docs/decisions/2026-07-17-home-feed-freshness.md)', () => {
  it('2. 정상 등록 성공 → 홈("/") 재검증 정확히 1회', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(201)
    expect(revalidatePathMock).toHaveBeenCalledTimes(1)
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('3. 정상 등록 성공 → 서버에서 확인한 School/Year/Class 경로만 함께 재검증', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)
    getSchoolByIdMock.mockResolvedValue({ slug: 'duru-high' })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(201)
    expect(revalidatePathMock.mock.calls.map(([path]) => path)).toEqual([
      '/',
      '/school/duru-high',
      '/school/duru-high/2015',
      '/school/duru-high/2015/3-2',
    ])
  })

  it('4. validation 실패(school_id UUID 아님) → 재검증 호출 안 함', async () => {
    const response = await POST(createRequest({ body: { ...VALID_BODY, school_id: 'not-a-uuid' } }))

    expect(response.status).toBe(400)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('5. rate limit 차단 → 재검증 호출 안 함', async () => {
    ratelimitLimitMock.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: 60 })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(429)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('6. Supabase insert 실패 → 재검증 호출 안 함', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: '500', message: 'db down' } })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(500)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('7. 중복 등록 거절(23505) → 재검증 호출 안 함', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(409)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('11. 재검증(revalidatePath) 실패가 이미 성공한 등록 응답을 실패로 바꾸지 않음', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)
    revalidatePathMock.mockImplementation(() => {
      throw new Error('cache error')
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'p1' } })
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})

describe('POST /api/profiles — PHASE 6A 성장 보상(growthReward)', () => {
  it('1. first_record — 0명→1명, 레벨은 그대로면 growthReward.outcome=first_record', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue({
      id: SCHOOL_ID,
      current_level: null,
      level_updated_at: null,
    })
    vi.mocked(syncSchoolLevel).mockResolvedValue({
      id: SCHOOL_ID,
      current_level: 1,
      level_updated_at: '2026-07-18T00:00:00.000Z',
    })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.data).toEqual({ id: 'p1' })
    expect(json.growthReward).toEqual({
      schoolId: SCHOOL_ID,
      before: {
        visibleProfileCount: 0,
        effectiveLevel: 1,
        nextLevel: 2,
        remainingToNext: 141,
        progressPercent: 0,
        isNearLevelUp: false,
      },
      after: {
        visibleProfileCount: 1,
        effectiveLevel: 1,
        nextLevel: 2,
        remainingToNext: 140,
        progressPercent: 1,
        isNearLevelUp: false,
      },
      outcome: 'first_record',
    })
  })

  it('2. level_up — before/after가 레벨 임계값(141)을 가로지르면 outcome=level_up', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(141)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue({
      id: SCHOOL_ID,
      current_level: 1,
      level_updated_at: null,
    })
    vi.mocked(syncSchoolLevel).mockResolvedValue({
      id: SCHOOL_ID,
      current_level: 2,
      level_updated_at: '2026-07-18T00:00:00.000Z',
    })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.growthReward.outcome).toBe('level_up')
    expect(json.growthReward.before.effectiveLevel).toBe(1)
    expect(json.growthReward.after.effectiveLevel).toBe(2)
    expect(json.growthReward.before.visibleProfileCount).toBe(140)
    expect(json.growthReward.after.visibleProfileCount).toBe(141)
  })

  it('3. progress — 레벨은 그대로, count만 늘면 outcome=progress', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(4)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue({
      id: SCHOOL_ID,
      current_level: 1,
      level_updated_at: null,
    })
    vi.mocked(syncSchoolLevel).mockResolvedValue({
      id: SCHOOL_ID,
      current_level: 1,
      level_updated_at: null,
    })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.growthReward.outcome).toBe('progress')
    expect(json.growthReward.before.visibleProfileCount).toBe(3)
    expect(json.growthReward.after.visibleProfileCount).toBe(4)
  })

  it('4. getSchoolLevelSnapshot이 null을 반환하면 성공 응답은 유지되지만 growthReward는 생략된다', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(3)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue(null)
    vi.mocked(syncSchoolLevel).mockResolvedValue({ id: SCHOOL_ID, current_level: 1, level_updated_at: null })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'p1' } })
    expect(json.growthReward).toBeUndefined()
  })

  it('5. syncSchoolLevel이 null을 반환하면(before snapshot은 성공해도) growthReward는 생략된다', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(3)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue({
      id: SCHOOL_ID,
      current_level: 1,
      level_updated_at: null,
    })
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'p1' } })
    expect(json.growthReward).toBeUndefined()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('6. 성장 스냅샷 계산 중 예외가 발생해도 201 유지, growthReward 생략, Home revalidation은 그대로 실행됨', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(3)
    vi.mocked(getSchoolLevelSnapshot).mockRejectedValue(new Error('supabase unreachable'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'p1' } })
    expect(json.growthReward).toBeUndefined()
    expect(syncSchoolLevel).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('7. 응답에 개인정보(닉네임/인스타그램/profile id)가 growthReward에 포함되지 않는다', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue({
      id: SCHOOL_ID,
      current_level: null,
      level_updated_at: null,
    })
    vi.mocked(syncSchoolLevel).mockResolvedValue({ id: SCHOOL_ID, current_level: 1, level_updated_at: null })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    const rewardKeys = Object.keys(json.growthReward)
    expect(rewardKeys).toEqual(['schoolId', 'before', 'after', 'outcome'])
    expect(JSON.stringify(json.growthReward)).not.toContain('gildong')
    expect(JSON.stringify(json.growthReward)).not.toContain('홍길동')
  })
})

describe('POST /api/profiles — PHASE 9 CAPTCHA', () => {
  it('1. CAPTCHA 검증 성공 → full Zod 검증 이후, DB insert 이전에 정확히 한 번 호출된다', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(201)
    expect(verifyCaptchaTokenMock).toHaveBeenCalledTimes(1)
    expect(verifyCaptchaTokenMock).toHaveBeenCalledWith('valid-turnstile-token', '127.0.0.1')
  })

  it('2. CAPTCHA 검증 실패(400) → insert/Level Sync 미호출, helper가 준 status/body를 그대로 반환', async () => {
    verifyCaptchaTokenMock.mockResolvedValue({
      verified: false,
      status: 400,
      body: { error: '보안 확인에 실패했습니다. 다시 시도해주세요.' },
    })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '보안 확인에 실패했습니다. 다시 시도해주세요.' })
    expect(fromMock).not.toHaveBeenCalled()
    expect(getSchoolProfileCount).not.toHaveBeenCalled()
    expect(syncSchoolLevel).not.toHaveBeenCalled()
  })

  it('3. CAPTCHA 검증 오류(500, 예: secret 누락 production) → insert/Level Sync 미호출', async () => {
    verifyCaptchaTokenMock.mockResolvedValue({
      verified: false,
      status: 500,
      body: { error: '서버 설정 오류입니다.' },
    })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: '서버 설정 오류입니다.' })
    expect(fromMock).not.toHaveBeenCalled()
    expect(getSchoolProfileCount).not.toHaveBeenCalled()
    expect(syncSchoolLevel).not.toHaveBeenCalled()
  })

  it('4. captchaToken 누락 → 400, verifyCaptchaToken 자체가 호출되지 않는다(Zod가 먼저 거른다)', async () => {
    const { captchaToken: _omit, ...withoutToken } = VALID_BODY
    const response = await POST(createRequest({ body: withoutToken }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '입력값이 올바르지 않습니다.' })
    expect(verifyCaptchaTokenMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('5. captchaToken 빈 문자열 → 400, verifyCaptchaToken 미호출', async () => {
    const response = await POST(createRequest({ body: { ...VALID_BODY, captchaToken: '' } }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '입력값이 올바르지 않습니다.' })
    expect(verifyCaptchaTokenMock).not.toHaveBeenCalled()
  })

  it('6. captchaToken이 2048자를 초과하면 400, verifyCaptchaToken 미호출(비정상적으로 긴 토큰 방어)', async () => {
    const response = await POST(createRequest({ body: { ...VALID_BODY, captchaToken: 'a'.repeat(2049) } }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '입력값이 올바르지 않습니다.' })
    expect(verifyCaptchaTokenMock).not.toHaveBeenCalled()
  })

  it('7. captchaToken이 정확히 2048자면 통과한다(경계값)', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    const response = await POST(createRequest({ body: { ...VALID_BODY, captchaToken: 'a'.repeat(2048) } }))

    expect(response.status).toBe(201)
    expect(verifyCaptchaTokenMock).toHaveBeenCalledTimes(1)
  })

  it('8. rate limit 초과 시 verifyCaptchaToken이 호출되지 않는다', async () => {
    ratelimitLimitMock.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: 60 })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(429)
    expect(verifyCaptchaTokenMock).not.toHaveBeenCalled()
  })

  it('9. CAPTCHA 성공 후 기존 growth/level sync가 그대로 동작한다(회귀 없음)', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(7)
    vi.mocked(syncSchoolLevel).mockResolvedValue({ id: SCHOOL_ID, current_level: 2, level_updated_at: null })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(201)
    expect(getSchoolProfileCount).toHaveBeenCalledWith(SCHOOL_ID)
    expect(syncSchoolLevel).toHaveBeenCalledWith(SCHOOL_ID, 7)
  })

  it('10. 성공 응답에 captchaToken이 포함되지 않는다', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(JSON.stringify(json)).not.toContain('captchaToken')
    expect(JSON.stringify(json)).not.toContain('valid-turnstile-token')
  })

  it('11. DB insert 페이로드에 captchaToken이 전달되지 않는다(DB에 저장하지 않음)', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p1' }, error: null })
    vi.mocked(getSchoolProfileCount).mockResolvedValue(1)
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)

    await POST(createRequest({ body: VALID_BODY }))

    const insertPayload = (insertMock.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(Object.keys(insertPayload)).not.toContain('captchaToken')
  })

  it('12. 실패 응답에 공급자(Cloudflare) 원문 오류가 노출되지 않는다', async () => {
    verifyCaptchaTokenMock.mockResolvedValue({
      verified: false,
      status: 400,
      body: { error: '보안 확인에 실패했습니다. 다시 시도해주세요.' },
    })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(JSON.stringify(json)).not.toMatch(/invalid-input-response|timeout-or-duplicate|error-codes/)
  })
})
