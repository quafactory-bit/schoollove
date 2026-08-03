import { describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'
import { POST } from './route'

function requestThatMustNotBeRead(): NextRequest {
  return {
    json: async () => {
      throw new Error('legacy report route read the request body')
    },
  } as unknown as NextRequest
}

describe('POST /api/reports — PHASE 10L permanent legacy-write boundary', () => {
  it('always returns the stable 503 boundary before parsing or persistence', async () => {
    const response = await POST(requestThatMustNotBeRead())

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      error: '기존 공개 프로필 신고·수정·삭제 요청은 개인정보 안전 전환으로 종료되었습니다.',
      code: 'LEGACY_REPORT_WRITE_PERMANENTLY_DISABLED',
    })
  })
})
