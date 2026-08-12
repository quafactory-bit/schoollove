import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { correlateUpstreamCallback } from './callback-correlation'
import { upstreamStateDigest } from './durable-upstream-leg'

describe('PHASE 10O-N callback correlation type boundary', () => {
  const registry = { kakao: { clientId: 'kakao-client', redirectUri: 'https://broker.schoollove.invalid/kakao' }, naver: { clientId: 'naver-client', redirectUri: 'https://broker.schoollove.invalid/naver' }, google: { clientId: 'google-client', redirectUri: 'https://broker.schoollove.invalid/google' } } as const
  const state = 'A'.repeat(43)

  it('turns only opaque state proof into DB-resolved trusted IDs', async () => {
    let seen: Uint8Array | undefined
    const result = await correlateUpstreamCallback({ provider: 'google', registry, callbackUrl: `${registry.google.redirectUri}?code=opaque%2Fcode&state=${state}`, claimByState: async input => {
      seen = input.stateDigest
      return { outcome: 'CALLBACK_CLAIMED', attemptId: 'a1000000-0000-4000-8000-000000000001', legId: 'a1000000-0000-4000-8000-000000000002', provider: 'google', nonceDigest: new Uint8Array(32), pkceS256Challenge: null, pkceVerifierCiphertext: null, pkceVerifierIv: null, pkceVerifierKeyVersion: null }
    } })
    expect(seen).toEqual(upstreamStateDigest(state))
    expect(result.context?.attemptId).toBe('a1000000-0000-4000-8000-000000000001')
    expect(result.context?.legId).toBe('a1000000-0000-4000-8000-000000000002')
    expect('PHASE10O_N_UNTRUSTED_TRUSTED_TYPE_SPLIT_OK').toBeTruthy()
  })

  it('rejects browser identity and provider-hint query parameters before claim', async () => {
    for (const hint of ['attempt_id=x', 'leg=x', 'transaction_id=x', 'provider=naver']) {
      await expect(correlateUpstreamCallback({ provider: 'google', registry, callbackUrl: `${registry.google.redirectUri}?code=x&state=${state}&${hint}`, claimByState: async () => { throw new Error('must not claim') } })).rejects.toThrow('UPSTREAM_CALLBACK_REJECTED')
    }
    expect('PHASE10O_N_BROWSER_IDS_REJECTED_OK').toBeTruthy()
  })
})
