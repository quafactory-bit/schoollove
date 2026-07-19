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

import { POST } from './route'

const PROFILE_ID = '11111111-1111-1111-1111-111111111111'

function allowAllRateLimits() {
  ratelimitLimitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 })
}

function createRequest(options: { body?: unknown; invalidJson?: boolean; ip?: string }): NextRequest {
  const fake = {
    headers: {
      get: (name: string) => {
        if (name === 'x-forwarded-for') return options.ip ?? null
        return null
      },
    },
    json: async () => {
      if (options.invalidJson) throw new SyntaxError('Unexpected token')
      return options.body
    },
  }
  return fake as unknown as NextRequest
}

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  allowAllRateLimits()
  singleMock.mockResolvedValue({ data: { id: 'report-1', status: 'pending' }, error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('POST /api/reports — 성공 경로', () => {
  it('1. 유효한 신고(report) 성공 → 201, reports에 정확한 payload로 insert', async () => {
    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '사칭' },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ data: { id: 'report-1', status: 'pending' }, error: null })
    expect(fromMock).toHaveBeenCalledWith('reports')
    expect(insertMock).toHaveBeenCalledWith({
      profile_id: PROFILE_ID,
      type: 'report',
      reason: '사칭',
      requested_instagram_id: null,
      is_self_claimed: false,
    })
  })

  it('2. 유효한 수정(edit) 요청 성공 → 201, reason/is_self_claimed은 서버가 고정값으로 설정', async () => {
    const request = createRequest({
      body: { type: 'edit', profile_id: PROFILE_ID, requested_instagram_id: 'new_id' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(insertMock).toHaveBeenCalledWith({
      profile_id: PROFILE_ID,
      type: 'edit',
      reason: '수정 요청',
      requested_instagram_id: 'new_id',
      is_self_claimed: true,
    })
  })

  it('3. 유효한 삭제(delete) 요청 성공 → 201, requested_instagram_id는 null', async () => {
    const request = createRequest({
      body: { type: 'delete', profile_id: PROFILE_ID },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(insertMock).toHaveBeenCalledWith({
      profile_id: PROFILE_ID,
      type: 'delete',
      reason: '삭제 요청',
      requested_instagram_id: null,
      is_self_claimed: true,
    })
  })

  it('14. 성공 응답에는 id/status 외 민감정보(reason/profile_id 등)를 포함하지 않는다', async () => {
    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(Object.keys(json.data)).toEqual(['id', 'status'])
  })
})

describe('POST /api/reports — validation', () => {
  it('4-1. reason이 허용 목록 밖 → 400', async () => {
    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '허용되지 않은 사유' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('4-2. profile_id가 UUID가 아님 → 400', async () => {
    const request = createRequest({
      body: { type: 'delete', profile_id: 'not-a-uuid' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('4-3. 잘못된 request type("hack") → 400', async () => {
    const request = createRequest({
      body: { type: 'hack', profile_id: PROFILE_ID },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('4-4. edit인데 requested_instagram_id 누락 → 400', async () => {
    const request = createRequest({
      body: { type: 'edit', profile_id: PROFILE_ID },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('16. JSON 파싱 실패 → 400', async () => {
    const request = createRequest({ invalidJson: true })
    const response = await POST(request)
    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '잘못된 요청입니다.' })
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/reports — 관리자용/예상치 못한 필드 차단', () => {
  it('12-1. status를 클라이언트가 지정 → 거부(400), insert 미호출', async () => {
    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타', status: 'done' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('12-2. is_hidden/report_count 같은 관리자 전용 필드 주입 → 거부(400)', async () => {
    const request = createRequest({
      body: {
        type: 'delete',
        profile_id: PROFILE_ID,
        is_hidden: false,
        report_count: 0,
      },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('12-3. is_self_claimed을 클라이언트가 직접 지정해도 거부됨(서버가 type만으로 결정)', async () => {
    const request = createRequest({
      body: { type: 'edit', profile_id: PROFILE_ID, requested_instagram_id: 'x', is_self_claimed: false },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('13. 완전히 예상하지 못한 임의 필드 → 거부(400)', async () => {
    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타', extraField: 'anything' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})

describe('POST /api/reports — 존재하지 않는 profile / DB 오류', () => {
  it('5. 존재하지 않는 profile_id(FK 위반, 23503) → 400, 원본 DB 오류 미노출', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: '23503', message: 'insert or update on table "reports" violates foreign key constraint' } })
    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: '존재하지 않는 프로필입니다.' })
    expect(JSON.stringify(json)).not.toMatch(/constraint|violates/i)
  })

  it('6. 그 외 DB insert 실패 → 500, 내부 오류 메시지 비노출', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: '500', message: 'internal db secret detail' } })
    const request = createRequest({
      body: { type: 'delete', profile_id: PROFILE_ID },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: '요청 처리 중 오류가 발생했습니다.' })
    expect(JSON.stringify(json)).not.toMatch(/secret detail/)
  })
})

describe('POST /api/reports — Rate Limit', () => {
  it('7-1. actor(IP) 한도 초과 → 429, insert 미호출', async () => {
    ratelimitLimitMock.mockImplementation((key: string) => {
      if (key.startsWith('report:')) return Promise.resolve({ success: false, limit: 5, remaining: 0, reset: 60 })
      return Promise.resolve({ success: true, limit: 1, remaining: 0, reset: 600 })
    })
    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' },
      ip: '1.2.3.4',
    })

    const response = await POST(request)
    expect(response.status).toBe(429)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('7-2. target(같은 IP+같은 profile) 한도 초과 → 429, insert 미호출', async () => {
    ratelimitLimitMock.mockImplementation((key: string) => {
      if (key === `report:1.2.3.4:${PROFILE_ID}`) {
        return Promise.resolve({ success: false, limit: 1, remaining: 0, reset: 600 })
      }
      return Promise.resolve({ success: true, limit: 5, remaining: 4, reset: 60 })
    })
    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' },
      ip: '1.2.3.4',
    })

    const response = await POST(request)
    expect(response.status).toBe(429)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('9. action별로 rate limit key가 분리된다(report와 delete가 같은 IP/프로필이어도 서로 다른 key)', async () => {
    allowAllRateLimits()
    await POST(
      createRequest({ body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' }, ip: '9.9.9.9' })
    )
    await POST(createRequest({ body: { type: 'delete', profile_id: PROFILE_ID }, ip: '9.9.9.9' }))

    const calledKeys = ratelimitLimitMock.mock.calls.map(([key]) => key)
    expect(calledKeys).toContain('report:9.9.9.9')
    expect(calledKeys).toContain(`report:9.9.9.9:${PROFILE_ID}`)
    expect(calledKeys).toContain('delete:9.9.9.9')
    expect(calledKeys).toContain(`delete:9.9.9.9:${PROFILE_ID}`)
  })

  it('10. 대상 profile별로 rate limit key가 분리된다(같은 IP·같은 action, 다른 profile)', async () => {
    allowAllRateLimits()
    const otherProfileId = '22222222-2222-2222-2222-222222222222'
    await POST(
      createRequest({ body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' }, ip: '9.9.9.9' })
    )
    await POST(
      createRequest({ body: { type: 'report', profile_id: otherProfileId, reason: '기타' }, ip: '9.9.9.9' })
    )

    const calledKeys = ratelimitLimitMock.mock.calls.map(([key]) => key)
    expect(calledKeys).toContain(`report:9.9.9.9:${PROFILE_ID}`)
    expect(calledKeys).toContain(`report:9.9.9.9:${otherProfileId}`)
  })

  it('11-1. production에서 Rate Limit 저장소 장애(limit()이 예외를 던짐) → fail-closed(503), insert 미호출', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    ratelimitLimitMock.mockRejectedValue(new Error('upstash unreachable'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' },
    })
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json).toEqual({ error: '일시적으로 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.' })
    expect(fromMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('11-2. production에서 Upstash client 생성 자체가 예외를 던짐 → 동일하게 fail-closed(503)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { Redis } = await import('@upstash/redis')
    const fromEnvSpy = vi.spyOn(Redis, 'fromEnv').mockImplementation(() => {
      throw new Error('missing config at runtime')
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const request = createRequest({
      body: { type: 'delete', profile_id: PROFILE_ID },
    })
    const response = await POST(request)

    expect(response.status).toBe(503)
    expect(fromMock).not.toHaveBeenCalled()

    fromEnvSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('11-3. development에서 Rate Limit 저장소 장애(limit()이 예외를 던짐) → fail-open, 요청은 계속 처리됨', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    ratelimitLimitMock.mockRejectedValue(new Error('upstash unreachable'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' },
    })
    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(fromMock).toHaveBeenCalledWith('reports')
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('15-1. Upstash 미설정 + production → 500 fail-closed, insert 미호출', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('NODE_ENV', 'production')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' },
    })
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: '서버 설정 오류입니다.' })
    expect(fromMock).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('15-2. Upstash 미설정 + development → rate limit 우회, 정상 처리됨', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const request = createRequest({
      body: { type: 'report', profile_id: PROFILE_ID, reason: '기타' },
    })
    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(fromMock).toHaveBeenCalledWith('reports')

    consoleWarnSpy.mockRestore()
  })
})
