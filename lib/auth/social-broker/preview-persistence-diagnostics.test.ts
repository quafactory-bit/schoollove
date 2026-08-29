import { describe, expect, it, vi } from 'vitest'
import { createPreviewBrokerPersistence, type PreviewRpcClient } from './preview-persistence'

vi.mock('server-only', () => ({}))

describe('preview broker durable diagnostic persistence port', () => {
  it('sends only the allowlisted diagnostic scalar fields to the atomic RPC', async () => {
    const calls: Array<Readonly<{ name: string; args?: Record<string, unknown> }>> = []
    const client: PreviewRpcClient = {
      rpc: async (name, args) => {
        calls.push({ name, args })
        return { data: 'REJECTED', error: null }
      },
    }

    await createPreviewBrokerPersistence(client).failClaimedUpstreamLeg({
      attemptId: 'attempt-id',
      legId: 'leg-id',
      reason: 'provider_failure',
      diagnostic: { reason: 'token_exchange_http_failed', upstreamStatus: 400 },
    })

    expect(calls).toEqual([{
      name: 'fail_upstream_login_leg_with_diagnostic',
      args: {
        target_attempt_id: 'attempt-id',
        target_leg_id: 'leg-id',
        reason: 'provider_failure',
        requested_diagnostic_reason: 'token_exchange_http_failed',
        requested_diagnostic_upstream_status: 400,
      },
    }])
    expect(JSON.stringify(calls)).not.toMatch(/authorization.?code|access.?token|id.?token|email|subject|nonce|state|verifier|headers|body|error/i)
  })

  it('keeps non-diagnostic legacy failures on the existing RPC', async () => {
    const calls: Array<Readonly<{ name: string; args?: Record<string, unknown> }>> = []
    const client: PreviewRpcClient = {
      rpc: async (name, args) => {
        calls.push({ name, args })
        return { data: 'EXPIRED', error: null }
      },
    }

    await expect(createPreviewBrokerPersistence(client).failClaimedUpstreamLeg({
      attemptId: 'attempt-id', legId: 'leg-id', reason: 'expired',
    })).resolves.toBe('EXPIRED')
    expect(calls).toEqual([{
      name: 'fail_upstream_login_leg',
      args: { target_attempt_id: 'attempt-id', target_leg_id: 'leg-id', reason: 'expired' },
    }])
  })
})
