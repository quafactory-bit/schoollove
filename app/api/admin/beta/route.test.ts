import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  getControlledBetaState: vi.fn(),
}))

vi.mock('@/lib/api/requireAdmin', () => ({ requireAdminSession: mocks.requireAdminSession }))
vi.mock('@/lib/betaOperations', () => ({
  getControlledBetaState: mocks.getControlledBetaState,
  applyControlledBetaAction: vi.fn(),
}))

import { GET } from './route'

const request = () => new NextRequest('http://localhost/api/admin/beta')

describe('GET /api/admin/beta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminSession.mockResolvedValue(true)
    mocks.getControlledBetaState.mockResolvedValue({
      programs: [],
      drafts: [],
      snapshots: [],
      incidents: [],
    })
  })

  it('returns the admin state contract when there are no incidents', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      programs: [],
      drafts: [],
      snapshots: [],
      incidents: [],
    })
  })

  it('returns a safe 500 instead of silently dropping a query failure', async () => {
    mocks.getControlledBetaState.mockRejectedValue(new Error('BETA_OPERATIONS_QUERY_FAILED'))

    const response = await GET(request())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'BETA_OPERATIONS_UNAVAILABLE' })
  })
})
