import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/admin-auth', () => ({
  verifySessionToken: vi.fn(),
  ADMIN_COOKIE_NAME: 'sl_admin_session',
}))

vi.mock('@/lib/api/admin', () => ({
  applyAdminModerationAction: vi.fn(),
}))

import { PATCH } from './route'
import { verifySessionToken } from '@/lib/admin-auth'
import { applyAdminModerationAction } from '@/lib/api/admin'

const REPORT_ID = '11111111-1111-1111-1111-111111111111'

function createRequest(options: { cookie?: string; body?: unknown; invalidJson?: boolean }): NextRequest {
  const fake = {
    cookies: {
      get: (_name: string) =>
        options.cookie !== undefined ? { name: 'sl_admin_session', value: options.cookie } : undefined,
    },
    json: async () => {
      if (options.invalidJson) throw new SyntaxError('Unexpected token')
      return options.body
    },
  }
  return fake as unknown as NextRequest
}

beforeEach(() => {
  process.env.ADMIN_PASSWORD = 'test-admin-password'
  vi.mocked(verifySessionToken).mockResolvedValue(true)
  vi.mocked(applyAdminModerationAction).mockResolvedValue(true)
})

afterEach(() => {
  delete process.env.ADMIN_PASSWORD
  vi.clearAllMocks()
})

describe('PATCH /api/admin/edit-requests — 인증', () => {
  it('1. 인증 쿠키 없음 → 401, 처리 함수 미호출', async () => {
    const request = createRequest({ cookie: undefined, body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)

    expect(response.status).toBe(401)
    expect(applyAdminModerationAction).not.toHaveBeenCalled()
  })

  it('2. 세션 토큰 검증 실패 → 401', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(false)
    const request = createRequest({ cookie: 'bad-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)

    expect(response.status).toBe(401)
    expect(applyAdminModerationAction).not.toHaveBeenCalled()
  })

  it('3. ADMIN_PASSWORD 미설정 → 401', async () => {
    delete process.env.ADMIN_PASSWORD
    const request = createRequest({ cookie: 'any-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)

    expect(response.status).toBe(401)
  })
})

describe('PATCH /api/admin/edit-requests — 처리 성공/되돌리기', () => {
  it('4. status=done → DB transaction RPC가 edit 반영·상태·audit를 함께 처리, 200', async () => {
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true })
    expect(applyAdminModerationAction).toHaveBeenCalledWith('edit_request_complete', REPORT_ID)
  })

  it('5. status=pending(되돌리기) → reopen transaction action만 요청한다', async () => {
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'pending' } })
    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(applyAdminModerationAction).toHaveBeenCalledWith('edit_request_reopen', REPORT_ID)
  })

  it('7. 성공 응답에는 success 외 다른 필드(프로필/인스타 원문 등)를 포함하지 않는다', async () => {
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)
    const json = await response.json()

    expect(Object.keys(json)).toEqual(['success'])
  })
})

describe('PATCH /api/admin/edit-requests — 실패 경로', () => {
  it('6-1. validation 실패(id가 UUID 아님) → 400', async () => {
    const request = createRequest({ cookie: 'good-token', body: { id: 'not-a-uuid', status: 'done' } })
    const response = await PATCH(request)
    expect(response.status).toBe(400)
    expect(applyAdminModerationAction).not.toHaveBeenCalled()
  })

  it('6-2. JSON 파싱 실패 → 400', async () => {
    const request = createRequest({ cookie: 'good-token', invalidJson: true })
    const response = await PATCH(request)
    expect(response.status).toBe(400)
  })

  it('6-3. transaction RPC가 false를 반환하면 부분 성공 없이 일반 500을 반환한다', async () => {
    vi.mocked(applyAdminModerationAction).mockResolvedValue(false)
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: 'Processing failed' })
    expect(JSON.stringify(json)).not.toMatch(/profile|instagram|requested/i)
  })
})
