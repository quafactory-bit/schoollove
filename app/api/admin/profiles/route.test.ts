import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { verifySessionTokenMock, getAdminProfilesMock } = vi.hoisted(() => ({
  verifySessionTokenMock: vi.fn(),
  getAdminProfilesMock: vi.fn(),
}))

vi.mock('@/lib/admin-auth', () => ({
  ADMIN_COOKIE_NAME: 'sl_admin_session',
  verifySessionToken: verifySessionTokenMock,
}))

vi.mock('@/lib/api/admin', () => ({
  getAdminProfiles: getAdminProfilesMock,
  hideProfile: vi.fn(),
  unhideProfile: vi.fn(),
  recordAdminAuditLog: vi.fn().mockResolvedValue(true),
}))

import { GET } from './route'

beforeEach(() => {
  vi.stubEnv('ADMIN_PASSWORD', 'test-password')
  verifySessionTokenMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

function request(url: string, withCookie = true): NextRequest {
  return new NextRequest(url, {
    headers: withCookie ? { cookie: 'sl_admin_session=valid-token' } : {},
  })
}

describe('GET /api/admin/profiles', () => {
  it('관리자 인증 없이 401을 반환하고 조회하지 않는다', async () => {
    const response = await GET(request('http://localhost/api/admin/profiles', false))

    expect(response.status).toBe(401)
    expect(getAdminProfilesMock).not.toHaveBeenCalled()
  })

  it('검색 성공 시 서버 조회 결과만 반환한다', async () => {
    const profile = {
      id: 'profile-1',
      school: { id: 'school-1', school_name: '한글고등학교', slug: 'hangul-high', school_type: 'high' },
    }
    getAdminProfilesMock.mockResolvedValue({ profiles: [profile], total: 1, error: false })

    const response = await GET(request('http://localhost/api/admin/profiles?q=%ED%95%9C%EA%B8%80'))

    expect(response.status).toBe(200)
    expect(getAdminProfilesMock).toHaveBeenCalledWith(1, '한글', 0)
    await expect(response.json()).resolves.toEqual({ profiles: [profile], total: 1 })
  })

  it('조회 오류는 0건 성공 응답이 아니라 일반 500 오류로 반환한다', async () => {
    getAdminProfilesMock.mockResolvedValue({ profiles: [], total: 0, error: true })

    const response = await GET(request('http://localhost/api/admin/profiles?q=error'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Search failed' })
  })
})
