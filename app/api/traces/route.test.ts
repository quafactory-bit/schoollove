import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { ratelimitLimitMock } = vi.hoisted(() => ({
  ratelimitLimitMock: vi.fn(),
}))

const { redisGetMock, redisSetMock } = vi.hoisted(() => ({
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
}))

const { fromMock, insertMock, selectMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectMock = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectMock }))
  const fromMock = vi.fn(() => ({ insert: insertMock }))
  return { fromMock, insertMock, selectMock, singleMock }
})

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow(...args: unknown[]) {
      return args
    }
    limit = ratelimitLimitMock
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({ get: redisGetMock, set: redisSetMock }) },
}))

vi.mock('@/lib/supabase', () => ({
  supabaseServer: { from: fromMock },
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

import { POST } from './route'

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111'

const VALID_BODY = {
  school_id: SCHOOL_ID,
  graduation_year: 2015,
  grade: 3,
  class_number: 2,
  message: '보고싶다',
}

function allowRateLimit() {
  ratelimitLimitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 })
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
  allowRateLimit()
  redisGetMock.mockResolvedValue(null)
  redisSetMock.mockResolvedValue('OK')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/traces', () => {
  it('1. rate limit 초과 → 429, insert 호출 안 함 (기존 rate limit 동작 유지)', async () => {
    ratelimitLimitMock.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 60 })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json).toEqual({ error: '잠시 후 다시 남겨주세요.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('2. JSON 파싱 실패 → 400 (기존 오류 응답 유지)', async () => {
    const response = await POST(createRequest({ invalidJson: true }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '잘못된 요청입니다.' })
  })

  it('3. school_id가 UUID가 아님 → 400 (기존 validation 유지)', async () => {
    const response = await POST(createRequest({ body: { ...VALID_BODY, school_id: 'not-a-uuid' } }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '입력값이 올바르지 않습니다.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('4. message 누락 → 400 (기존 validation 유지)', async () => {
    const { message: _message, ...withoutMessage } = VALID_BODY
    const response = await POST(createRequest({ body: withoutMessage }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '입력값이 올바르지 않습니다.' })
  })

  it('5. 같은 IP·학교·문구 10분 내 중복(dedupe) → 409, insert 호출 안 함 (기존 dedupe 동작 유지)', async () => {
    redisGetMock.mockResolvedValue('1')

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json).toEqual({ error: '방금 같은 글을 남겼어요.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('6. Supabase insert 실패 → 500 (기존 오류 응답 유지)', async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: '등록 중 오류가 발생했습니다.' })
  })

  it('7. 정상 등록 성공 → 201 + { data } (기존 응답 계약 유지)', async () => {
    singleMock.mockResolvedValue({ data: { id: 't1' }, error: null })

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 't1' } })
    expect(fromMock).toHaveBeenCalledWith('traces')
  })
})

describe('POST /api/traces — 홈 피드 재검증 계약 (Phase 4B, docs/decisions/2026-07-17-home-feed-freshness.md)', () => {
  it('3. 정상 등록 성공 → 홈("/") 재검증 정확히 1회', async () => {
    singleMock.mockResolvedValue({ data: { id: 't1' }, error: null })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(201)
    expect(revalidatePathMock).toHaveBeenCalledTimes(1)
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('7. validation 실패(message 누락) → 재검증 호출 안 함', async () => {
    const { message: _message, ...withoutMessage } = VALID_BODY
    const response = await POST(createRequest({ body: withoutMessage }))

    expect(response.status).toBe(400)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('8. rate limit 차단 → 재검증 호출 안 함', async () => {
    ratelimitLimitMock.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 60 })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(429)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('9. Supabase insert 실패 → 재검증 호출 안 함', async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(500)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('dedupe 거절 → 재검증 호출 안 함', async () => {
    redisGetMock.mockResolvedValue('1')

    const response = await POST(createRequest({ body: VALID_BODY }))

    expect(response.status).toBe(409)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('12. 재검증(revalidatePath) 실패가 이미 성공한 등록 응답을 실패로 바꾸지 않음', async () => {
    singleMock.mockResolvedValue({ data: { id: 't1' }, error: null })
    revalidatePathMock.mockImplementation(() => {
      throw new Error('cache error')
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(createRequest({ body: VALID_BODY }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 't1' } })
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
