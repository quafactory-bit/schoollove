import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  beta: vi.fn(),
  publicActive: vi.fn(),
  rate: vi.fn(),
  ip: vi.fn(() => '203.0.113.20'),
}))

vi.mock('@/lib/user-auth', () => ({ getAuthenticatedRequestContext: mocks.auth }))
vi.mock('@/lib/beta', () => ({ hasBetaFeatureAccess: mocks.beta }))
vi.mock('@/lib/publicAccountLaunch', () => ({ hasPublicAccountAccessActive: mocks.publicActive }))
vi.mock('@/lib/security/connectionRateLimit', () => ({
  checkConnectionRateLimit: mocks.rate,
  getRequestIp: mocks.ip,
}))

import { requireConnectionContext } from './connectionRoute'

const request = new Request('http://localhost/api/connections/search')
const auth = { user: { id: '00000000-0000-4000-8000-000000000001' }, client: {} }

describe('PHASE 10V connection context authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue(auth)
    mocks.beta.mockResolvedValue(true)
    mocks.publicActive.mockResolvedValue(true)
    mocks.rate.mockResolvedValue({ allowed: true })
  })

  it('requires an authenticated SchoolLove session before every action', async () => {
    mocks.auth.mockResolvedValue(null)
    const result = await requireConnectionContext(request as never, 'search')
    const response = 'response' in result ? result.response : null
    expect(response?.status).toBe(401)
    expect(mocks.beta).not.toHaveBeenCalled()
    expect(mocks.rate).not.toHaveBeenCalled()
  })

  it.each([
    ['search', ['people_search']],
    ['request', ['people_search', 'connection_request']],
    ['reminder', ['people_search', 'connection_request']],
  ] as const)('%s requires its beta features, public-active state, and rate limit', async (action, features) => {
    const result = await requireConnectionContext(request as never, action)
    expect('auth' in result).toBe(true)
    expect(mocks.beta.mock.calls.map((call) => call[2])).toEqual(features)
    expect(mocks.publicActive).toHaveBeenCalledWith(auth.client, auth.user.id)
    expect(mocks.rate).toHaveBeenCalledWith({ ip: '203.0.113.20', userId: auth.user.id, action })
  })

  it('fails before public/data work when a required beta feature is disabled', async () => {
    mocks.beta.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const result = await requireConnectionContext(request as never, 'request')
    const response = 'response' in result ? result.response : null
    expect(response?.status).toBe(403)
    expect(mocks.publicActive).not.toHaveBeenCalled()
    expect(mocks.rate).not.toHaveBeenCalled()
  })

  it('fails closed when public-account authority is inactive', async () => {
    mocks.publicActive.mockResolvedValue(false)
    const result = await requireConnectionContext(request as never, 'search')
    const response = 'response' in result ? result.response : null
    expect(response?.status).toBe(403)
    expect(mocks.rate).not.toHaveBeenCalled()
  })

  it('keeps safety response rate-limited while explicit empty features bypass discovery/public-active gates', async () => {
    const result = await requireConnectionContext(request as never, 'response', [])
    expect('auth' in result).toBe(true)
    expect(mocks.beta).not.toHaveBeenCalled()
    expect(mocks.publicActive).not.toHaveBeenCalled()
    expect(mocks.rate).toHaveBeenCalledWith({ ip: '203.0.113.20', userId: auth.user.id, action: 'response' })
  })

  it('preserves 429 Retry-After from the rate authority', async () => {
    mocks.rate.mockResolvedValue({ allowed: false, status: 429, retryAfter: 47 })
    const result = await requireConnectionContext(request as never, 'search')
    const response = 'response' in result ? result.response : null
    expect(response?.status).toBe(429)
    expect(response?.headers.get('Retry-After')).toBe('47')
  })
})
