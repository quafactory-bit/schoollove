import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/beta', () => ({ createBetaInviteToken: vi.fn(), hashBetaIdentity: vi.fn() }))
import { runMaintenance } from './operations'

describe('scheduled privacy maintenance', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.rpc.mockResolvedValue({ error: null, data: { ok: true } })
  })
  it('includes privacy cleanup in the existing authenticated maintenance path', async () => {
    await expect(runMaintenance('test', '2026-09-16T00:00:00Z')).resolves.toHaveProperty('privacy.ok', true)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      'run_privacy_retention_cleanup', 'run_phase10f_maintenance', 'run_phase10h_maintenance',
    ])
  })
  it.each([{ error: {}, data: null }, { error: null, data: null }, { error: null, data: { ok: false } }])(
    'surfaces failed cleanup to the scheduler', async result => {
      mocks.rpc.mockResolvedValueOnce(result)
      await expect(runMaintenance('test')).rejects.toThrow('PRIVACY_MAINTENANCE_FAILED')
      expect(mocks.rpc).toHaveBeenCalledTimes(1)
    },
  )
})
