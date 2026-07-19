import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/admin-auth', () => ({
  verifySessionToken: vi.fn(),
  ADMIN_COOKIE_NAME: 'sl_admin_session',
}))

vi.mock('@/lib/api/admin', () => ({
  markRequestAsDone: vi.fn(),
  markRequestAsPending: vi.fn(),
  getEditRequestDetail: vi.fn(),
  applyProfileInstagramEdit: vi.fn(),
}))

import { PATCH } from './route'
import { verifySessionToken } from '@/lib/admin-auth'
import {
  markRequestAsDone,
  markRequestAsPending,
  getEditRequestDetail,
  applyProfileInstagramEdit,
} from '@/lib/api/admin'

const REPORT_ID = '11111111-1111-1111-1111-111111111111'
const PROFILE_ID = '22222222-2222-2222-2222-222222222222'

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
  vi.mocked(getEditRequestDetail).mockResolvedValue({ profileId: PROFILE_ID, requestedInstagramId: 'new_id' })
  vi.mocked(applyProfileInstagramEdit).mockResolvedValue(true)
  vi.mocked(markRequestAsDone).mockResolvedValue(true)
  vi.mocked(markRequestAsPending).mockResolvedValue(true)
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
    expect(getEditRequestDetail).not.toHaveBeenCalled()
    expect(applyProfileInstagramEdit).not.toHaveBeenCalled()
  })

  it('2. 세션 토큰 검증 실패 → 401', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(false)
    const request = createRequest({ cookie: 'bad-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)

    expect(response.status).toBe(401)
    expect(applyProfileInstagramEdit).not.toHaveBeenCalled()
  })

  it('3. ADMIN_PASSWORD 미설정 → 401', async () => {
    delete process.env.ADMIN_PASSWORD
    const request = createRequest({ cookie: 'any-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)

    expect(response.status).toBe(401)
  })
})

describe('PATCH /api/admin/edit-requests — 처리 성공/되돌리기', () => {
  it('4. status=done → 요청 상세를 다시 조회해 그 값으로 반영, markRequestAsDone 호출, 200', async () => {
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true })
    expect(getEditRequestDetail).toHaveBeenCalledWith(REPORT_ID)
    expect(applyProfileInstagramEdit).toHaveBeenCalledWith(PROFILE_ID, 'new_id')
    expect(markRequestAsDone).toHaveBeenCalledWith(REPORT_ID)
    expect(markRequestAsPending).not.toHaveBeenCalled()
  })

  it('5. status=pending(되돌리기) → markRequestAsPending만 호출, profiles는 재적용하지 않음', async () => {
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'pending' } })
    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(markRequestAsPending).toHaveBeenCalledWith(REPORT_ID)
    expect(applyProfileInstagramEdit).not.toHaveBeenCalled()
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
    expect(getEditRequestDetail).not.toHaveBeenCalled()
  })

  it('6-2. JSON 파싱 실패 → 400', async () => {
    const request = createRequest({ cookie: 'good-token', invalidJson: true })
    const response = await PATCH(request)
    expect(response.status).toBe(400)
  })

  it('6-3. 존재하지 않는 edit 요청(getEditRequestDetail이 null) → 404, 아무것도 갱신하지 않음', async () => {
    vi.mocked(getEditRequestDetail).mockResolvedValue(null)
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)

    expect(response.status).toBe(404)
    expect(applyProfileInstagramEdit).not.toHaveBeenCalled()
    expect(markRequestAsDone).not.toHaveBeenCalled()
  })

  it('6-4. profiles 반영(UPDATE) 실패 → 500, markRequestAsDone은 호출조차 되지 않는다(잘못된 done 상태 방지)', async () => {
    vi.mocked(applyProfileInstagramEdit).mockResolvedValue(false)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)

    expect(response.status).toBe(500)
    expect(markRequestAsDone).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('6-5. profiles 반영은 성공했지만 markRequestAsDone만 실패(부분 성공) → 500, 원인이 서버 로그에 남음', async () => {
    vi.mocked(markRequestAsDone).mockResolvedValue(false)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'done' } })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(applyProfileInstagramEdit).toHaveBeenCalledWith(PROFILE_ID, 'new_id')
    expect(json).toEqual({ error: 'Processing failed' })
    expect(JSON.stringify(json)).not.toMatch(/new_id|instagram/i)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('부분 성공'),
      expect.objectContaining({ reportId: REPORT_ID })
    )

    consoleErrorSpy.mockRestore()
  })

  it('6-6. markRequestAsPending 실패(되돌리기) → 500', async () => {
    vi.mocked(markRequestAsPending).mockResolvedValue(false)
    const request = createRequest({ cookie: 'good-token', body: { id: REPORT_ID, status: 'pending' } })
    const response = await PATCH(request)
    expect(response.status).toBe(500)
  })
})
