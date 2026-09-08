import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => {
  type QueryCall = {
    table: string
    select?: string
    order?: { column: string; options: unknown }
  }
  const calls: QueryCall[] = []
  const state: { incidentError: unknown } = { incidentError: null }
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table }
    calls.push(call)
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((columns: string) => { call.select = columns; return builder })
    builder.order = vi.fn((column: string, options?: unknown) => { call.order = { column, options }; return builder })
    builder.limit = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({
      data: [],
      error: table === 'operational_incidents' ? state.incidentError : null,
    }).then(resolve, reject)
    return builder
  })
  const rpc = vi.fn()
  return { calls, from, state, rpc }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: supabaseMock.from, rpc: supabaseMock.rpc }),
}))

import { applyControlledBetaAction, getControlledBetaState } from './betaOperations'

describe('controlled beta operational capacity action', () => {
  const operation = { action: 'set_operational_cap' as const, programId: '10000000-0000-4000-8000-000000000001', maxUsers: 5, reason: 'OPERATOR_APPROVED_CAP' }
  beforeEach(() => supabaseMock.rpc.mockReset())
  it('uses only the official audited RPC, not a direct table update', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: null })
    await expect(applyControlledBetaAction(operation)).resolves.toEqual({ applied: true })
    expect(supabaseMock.rpc).toHaveBeenCalledExactlyOnceWith('admin_set_beta_operational_cap', {
      target_program_id: operation.programId, requested_max_users: 5,
      requested_reason: operation.reason, admin_actor: expect.any(String),
    })
  })
  it('does not claim success when the DB capacity gate rejects the action', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: { message: 'PROGRAM_FULL' } })
    await expect(applyControlledBetaAction(operation)).rejects.toThrow()
  })
})

describe('controlled beta operational incident state', () => {
  beforeEach(() => {
    supabaseMock.calls.length = 0
    supabaseMock.from.mockClear()
    supabaseMock.state.incidentError = null
  })

  it('queries operational_incidents with the canonical schema and ordering', async () => {
    await getControlledBetaState()

    const incidentQuery = supabaseMock.calls.find((call) => call.table === 'operational_incidents')
    expect(incidentQuery).toEqual({
      table: 'operational_incidents',
      select: 'id,incident_key,severity,status,summary,opened_at,resolved_at',
      order: { column: 'opened_at', options: { ascending: false } },
    })
    expect(incidentQuery?.select?.split(',')).not.toContain('safe_summary')
    expect(incidentQuery?.select?.split(',')).not.toContain('created_at')
  })

  it('keeps incident query failures fail-closed', async () => {
    supabaseMock.state.incidentError = { message: 'schema query failed' }

    await expect(getControlledBetaState()).rejects.toThrow('BETA_OPERATIONS_QUERY_FAILED')
  })
})
