import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { POST } from './route'
import { verifySessionToken } from '@/lib/admin-auth'
import { getSchoolLevelSnapshot, syncSchoolLevel } from '@/lib/api/levels'
import type { SchoolLevelPersistenceRow } from '@/types/level'

vi.mock('@/lib/admin-auth', () => ({
  verifySessionToken: vi.fn(),
  ADMIN_COOKIE_NAME: 'sl_admin_session',
}))

vi.mock('@/lib/api/levels', () => ({
  getSchoolLevelSnapshot: vi.fn(),
  syncSchoolLevel: vi.fn(),
}))

vi.mock('@/lib/api/admin', () => ({
  recordAdminAuditLog: vi.fn().mockResolvedValue(true),
}))

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111'

function schoolLevelRow(
  currentLevel: number | null,
  levelUpdatedAt: string | null = null
): SchoolLevelPersistenceRow {
  return {
    id: SCHOOL_ID,
    current_level: currentLevel,
    level_updated_at: levelUpdatedAt,
  }
}

function createRequest(options: {
  cookie?: string
  body?: unknown
  invalidJson?: boolean
}): NextRequest {
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
})

afterEach(() => {
  delete process.env.ADMIN_PASSWORD
  vi.clearAllMocks()
})

describe('POST /api/admin/tools/level-sync', () => {
  it('1. 인증 쿠키 없음 → 401', async () => {
    const request = createRequest({ cookie: undefined, body: { schoolId: SCHOOL_ID, cumulativeXp: 10 } })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ error: 'Unauthorized' })
    expect(getSchoolLevelSnapshot).not.toHaveBeenCalled()
    expect(syncSchoolLevel).not.toHaveBeenCalled()
  })

  it('2. 유효하지 않은 세션 → 401', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(false)
    const request = createRequest({ cookie: 'invalid-token', body: { schoolId: SCHOOL_ID, cumulativeXp: 10 } })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ error: 'Unauthorized' })
  })

  it('3. JSON 파싱 실패(malformed JSON) → 400 Bad request', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    const request = createRequest({ cookie: 'valid-token', invalidJson: true })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Bad request' })
  })

  it('4. schoolId UUID 아님 → 400 Invalid input (schema validation)', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: 'not-a-uuid', cumulativeXp: 10 },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid input' })
  })

  it('5. cumulativeXp 음수 → 400 Invalid input (schema validation)', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: SCHOOL_ID, cumulativeXp: -1 },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid input' })
  })

  it('6. cumulativeXp 소수 → 400 Invalid input (schema validation)', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: SCHOOL_ID, cumulativeXp: 1.5 },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid input' })
  })

  it('7. cumulativeXp가 safe integer 범위 초과 → 400 Invalid input (schema validation, valid JSON)', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: SCHOOL_ID, cumulativeXp: Number.MAX_SAFE_INTEGER + 1 },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid input' })
  })

  it('8. getSchoolLevelSnapshot null → 500 Snapshot failed', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue(null)
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: SCHOOL_ID, cumulativeXp: 10 },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: 'Snapshot failed' })
    expect(syncSchoolLevel).not.toHaveBeenCalled()
  })

  it('9. before 정상 + syncSchoolLevel null → 500 Sync failed', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue(schoolLevelRow(2))
    vi.mocked(syncSchoolLevel).mockResolvedValue(null)
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: SCHOOL_ID, cumulativeXp: 260 },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: 'Sync failed' })
  })

  it('10. 정상 성공 → 200, before/after가 mock 반환값과 정확히 일치', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    const beforeRow = schoolLevelRow(2, null)
    const afterRow = schoolLevelRow(3, '2026-01-01T00:00:00.000Z')
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue(beforeRow)
    vi.mocked(syncSchoolLevel).mockResolvedValue(afterRow)
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: SCHOOL_ID, cumulativeXp: 260 },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      success: true,
      schoolId: SCHOOL_ID,
      cumulativeXp: 260,
      before: beforeRow,
      after: afterRow,
    })
  })

  it('11. before와 after가 동일한 경우 → 200, 동일값 그대로 반환', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    const sameRow = schoolLevelRow(3, '2026-01-01T00:00:00.000Z')
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue(sameRow)
    vi.mocked(syncSchoolLevel).mockResolvedValue(sameRow)
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: SCHOOL_ID, cumulativeXp: 0 },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.before).toEqual(sameRow)
    expect(json.after).toEqual(sameRow)
  })

  it('12. getSchoolLevelSnapshot/syncSchoolLevel 호출 인자가 요청 body와 정확히 일치', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(true)
    vi.mocked(getSchoolLevelSnapshot).mockResolvedValue(schoolLevelRow(1))
    vi.mocked(syncSchoolLevel).mockResolvedValue(schoolLevelRow(2))
    const request = createRequest({
      cookie: 'valid-token',
      body: { schoolId: SCHOOL_ID, cumulativeXp: 141 },
    })

    await POST(request)

    expect(getSchoolLevelSnapshot).toHaveBeenCalledWith(SCHOOL_ID)
    expect(syncSchoolLevel).toHaveBeenCalledWith(SCHOOL_ID, 141)
  })
})
