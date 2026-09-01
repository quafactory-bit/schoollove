import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  readJson: vi.fn(),
  find: vi.fn(),
  record: vi.fn(),
}))

vi.mock('@/lib/api/connectionRoute', () => ({
  requireConnectionContext: mocks.context,
  readJson: mocks.readJson,
}))
vi.mock('@/lib/connections', () => ({ findExactConnectionMatch: mocks.find }))
vi.mock('@/lib/onboarding', () => ({ recordLimitedLaunchEvent: mocks.record }))

import { POST } from './route'

const request = new Request('http://localhost/api/connections/search', { method: 'POST' })
const valid = {
  school_id: '11111111-1111-4111-8111-111111111111',
  graduation_year: 2005,
  exact_name: '김하늘',
}

describe('PHASE 10V contracted search response and timing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.mockResolvedValue({ auth: { user: { id: 'actor' } } })
    mocks.readJson.mockResolvedValue(valid)
    mocks.record.mockResolvedValue(undefined)
  })

  it('pads representative non-match states and contracts them to one browser body', async () => {
    const samples: Record<string, number[]> = {}
    const sizes: Record<string, number> = {}
    for (const state of ['not_found', 'request_unavailable', 'already_requested']) {
      samples[state] = []
      mocks.find.mockResolvedValue({ state, matchToken: null })
      for (let index = 0; index < 3; index += 1) {
        const started = performance.now()
        const response = (await POST(request as never))!
        samples[state].push(performance.now() - started)
        const body = await response.text()
        sizes[state] = new TextEncoder().encode(body).byteLength
        expect(response.status).toBe(200)
        expect(JSON.parse(body)).toEqual({ state: 'unavailable' })
      }
    }
    for (const values of Object.values(samples)) {
      expect(Math.min(...values)).toBeGreaterThanOrEqual(230)
    }
    expect(new Set(Object.values(sizes)).size).toBe(1)
  }, 10_000)

  it('pads authorization and validation failures without issuing a match query', async () => {
    mocks.context.mockResolvedValueOnce({ response: new Response('{"error":"LIMITED_BETA_ACCESS_REQUIRED"}', { status: 403 }) })
    let started = performance.now()
    const denied = (await POST(request as never))!
    expect(performance.now() - started).toBeGreaterThanOrEqual(230)
    expect(denied.status).toBe(403)

    mocks.readJson.mockResolvedValueOnce({ exact_name: '김' })
    started = performance.now()
    const invalid = (await POST(request as never))!
    expect(performance.now() - started).toBeGreaterThanOrEqual(230)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ state: 'invalid_search' })
    expect(mocks.find).not.toHaveBeenCalled()
  }, 5_000)
})
