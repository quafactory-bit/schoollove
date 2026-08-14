import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { DarkBrokerOrchestrator, type DarkBrokerPersistence } from './dark-orchestrator'
import { createSyntheticClient } from './http'
import { SocialBrokerError } from './errors'
import { downstreamAuthorizationBoundHandleDigest } from './authorization-transaction'

const redirect = 'https://local.supabase.invalid/auth/v1/callback'
const client = createSyntheticClient('slb-supabase-google', 'secret', redirect, 'google')
const context = { authorizationTransactionId: 'd1000000-0000-4000-8000-000000000001', loginAttemptId: 'd1000000-0000-4000-8000-000000000002', clientId: client.clientId, redirectUri: redirect, pkceS256Challenge: 'A'.repeat(43), downstreamNonce: 'downstream-nonce', downstreamState: 'exact state +/%?' } as const

function persistence(): DarkBrokerPersistence {
  let claimed = false
  return {
    createAttempt: async () => context.loginAttemptId,
    createTransaction: async () => 'TRANSACTION_CREATED',
    claimTransaction: async () => claimed ? { outcome: 'CORRELATION_REJECTED', transactionId: null, attemptId: null, clientId: null, redirectUri: null, scopes: null, pkceS256Challenge: null } : (claimed = true, { outcome: 'TRANSACTION_CLAIMED', transactionId: context.authorizationTransactionId, attemptId: context.loginAttemptId, clientId: client.clientId, redirectUri: redirect, scopes: 'openid', pkceS256Challenge: context.pkceS256Challenge }),
    createUpstreamLeg: async () => 'UPSTREAM_LEG_CREATED', bindTransactionLeg: async () => 'UPSTREAM_BOUND', failClaimedUpstreamLeg: async () => 'REJECTED',
    claimCallback: async () => ({ outcome: 'REPLAY_REJECTED', attemptId: null, legId: null, provider: null, nonceDigest: null, pkceS256Challenge: null, pkceVerifierCiphertext: null, pkceVerifierIv: null, pkceVerifierKeyVersion: null }),
    recordVerifiedIdentity: async () => 'EXISTING_PRIMARY', resolveIssuanceContext: async () => context,
    issueTransactionBoundCode: async () => 'AUTHORIZATION_CODE_CREATED',
  }
}

function orchestrator(port = persistence()) {
  return new DarkBrokerOrchestrator({ clients: [client], persistence: port, upstream: { google: { clientId: 'google-upstream', redirectUri: 'https://broker.invalid/google/callback' }, kakao: { clientId: 'kakao-upstream', redirectUri: 'https://broker.invalid/kakao/callback' }, naver: { clientId: 'naver-upstream', redirectUri: 'https://broker.invalid/naver/callback' } }, keys: { upstreamPkce: { version: 1, material: Buffer.alloc(32, 1) }, downstreamNonce: { version: 1, material: Buffer.alloc(32, 2) }, brokerSubject: Buffer.alloc(32, 3), brokerSubjectKeyVersion: 1 }, now: () => 1_800_000_000 })
}

describe('dark end-to-end broker orchestration', () => {
  const authorizeUrl = () => new URL(`https://broker.invalid/oauth/authorize?response_type=code&client_id=${client.clientId}&redirect_uri=${encodeURIComponent(redirect)}&scope=openid%20profile&state=${encodeURIComponent(context.downstreamState)}&nonce=${context.downstreamNonce}&code_challenge=${context.pkceS256Challenge}&code_challenge_method=S256`)

  it('PHASE10O_Q_VALIDATED_DOWNSTREAM_TO_DURABLE_HANDLE_OK', async () => {
    const result = await orchestrator().begin(authorizeUrl())
    expect(result).toMatchObject({ provider: 'google' }); expect(result.brokerHandle).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(result.browserBindingSecret).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(result.browserBindingSecret).not.toBe(result.brokerHandle)
  })

  it('PHASE10O_Q_HANDLE_RESTART_REPLAY_REJECTED', async () => {
    const q = orchestrator(); const started = await q.begin(authorizeUrl())
    const continued = await q.continueFromHandle({ brokerHandle: started.brokerHandle, browserBindingSecret: started.browserBindingSecret })
    expect(continued.authorization).toMatchObject({ rawNonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), pkceChallenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) })
    await expect(q.continueFromHandle({ brokerHandle: started.brokerHandle, browserBindingSecret: started.browserBindingSecret })).rejects.toThrow('DARK_CONTINUATION_REJECTED')
  })

  it('PHASE10O_Q_BROWSER_BOUND_CONTINUATION_REJECTS_WRONG_OR_MISSING_BINDING', async () => {
    let expected: Uint8Array | null = null
    const port: DarkBrokerPersistence = { ...persistence(), claimTransaction: async value => {
      if (!expected || !Buffer.from(value).equals(Buffer.from(expected))) return { outcome: 'CORRELATION_REJECTED', transactionId: null, attemptId: null, clientId: null, redirectUri: null, scopes: null, pkceS256Challenge: null }
      return { outcome: 'TRANSACTION_CLAIMED', transactionId: context.authorizationTransactionId, attemptId: context.loginAttemptId, clientId: client.clientId, redirectUri: redirect, scopes: 'openid', pkceS256Challenge: context.pkceS256Challenge }
    } }
    const q = orchestrator(port); const started = await q.begin(authorizeUrl()); expected = downstreamAuthorizationBoundHandleDigest(started.brokerHandle, started.browserBindingSecret)
    await expect(q.continueFromHandle({ brokerHandle: started.brokerHandle, browserBindingSecret: 'A'.repeat(43) })).rejects.toThrow('DARK_CONTINUATION_REJECTED')
    await expect(q.continueFromHandle({ brokerHandle: started.brokerHandle, browserBindingSecret: '' })).rejects.toThrow('DOWNSTREAM_AUTHORIZATION_BROWSER_BINDING_INVALID')
    await expect(q.continueFromHandle({ brokerHandle: started.brokerHandle, browserBindingSecret: started.browserBindingSecret })).resolves.toMatchObject({ provider: 'google' })
  })

  it('PHASE10O_Q_FINALIZATION_OWNS_EXACT_RESPONSE_CONTEXT', async () => {
    const response = await orchestrator().finalizeReadyAttempt({ trustedAttemptId: context.loginAttemptId, authenticationTime: 1_799_999_900 })
    expect(response).toMatchObject({ redirectUri: redirect, downstreamState: context.downstreamState }); expect(response.authorizationCode).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('PHASE10O_Q_PROVIDER_FAILURE_TERMINALIZES_CLAIMED_LEG', async () => {
    let terminalized = 0
    const port = persistence()
    const configured: DarkBrokerPersistence = {
      ...port,
      claimCallback: async () => ({ outcome: 'CALLBACK_CLAIMED', attemptId: context.loginAttemptId, legId: 'd1000000-0000-4000-8000-000000000003', provider: 'google', nonceDigest: Buffer.alloc(32, 1), pkceS256Challenge: 'B'.repeat(43), pkceVerifierCiphertext: Buffer.alloc(17, 2), pkceVerifierIv: Buffer.alloc(12, 3), pkceVerifierKeyVersion: 1 }),
      failClaimedUpstreamLeg: async () => { terminalized += 1; return 'REJECTED' },
    }
    await expect(orchestrator(configured).callback({ provider: 'google', callbackUrl: 'https://broker.invalid/google/callback?code=synthetic-code&state=' + 'A'.repeat(43), verifier: { verify: async () => { throw new Error('provider rejected') } } })).rejects.toThrow('DARK_CALLBACK_REJECTED')
    expect(terminalized).toBe(1)
  })

  it('PHASE10O_Q_ONLY_TYPED_EXPIRY_SELECTS_EXPIRED_TERMINATION', async () => {
    const reasons: string[] = []
    const port: DarkBrokerPersistence = { ...persistence(), claimCallback: async () => ({ outcome: 'CALLBACK_CLAIMED', attemptId: context.loginAttemptId, legId: 'd1000000-0000-4000-8000-000000000003', provider: 'google', nonceDigest: Buffer.alloc(32, 1), pkceS256Challenge: 'B'.repeat(43), pkceVerifierCiphertext: Buffer.alloc(17, 2), pkceVerifierIv: Buffer.alloc(12, 3), pkceVerifierKeyVersion: 1 }), failClaimedUpstreamLeg: async input => { reasons.push(input.reason); return input.reason === 'expired' ? 'EXPIRED' : 'REJECTED' } }
    await expect(orchestrator(port).callback({ provider: 'google', callbackUrl: 'https://broker.invalid/google/callback?code=synthetic-code&state=' + 'A'.repeat(43), verifier: { verify: async () => { throw new SocialBrokerError('UPSTREAM_RESPONSE_EXPIRED') } } })).rejects.toThrow('DARK_CALLBACK_REJECTED')
    await expect(orchestrator({ ...port, failClaimedUpstreamLeg: async input => { reasons.push(input.reason); return 'REJECTED' } }).callback({ provider: 'google', callbackUrl: 'https://broker.invalid/google/callback?code=synthetic-code&state=' + 'A'.repeat(43), verifier: { verify: async () => { throw new Error('UPSTREAM_RESPONSE_EXPIRED') } } })).rejects.toThrow('DARK_CALLBACK_REJECTED')
    expect(reasons).toEqual(['expired', 'provider_failure'])
  })

  it('PHASE10O_Q_CALLBACK_PRIVATE_ID_INJECTION_REJECTED', async () => {
    for (const key of ['attempt', 'attempt_id', 'safe_attempt_id', 'login_attempt_id', 'leg', 'leg_id', 'transaction', 'transaction_id']) {
      await expect(orchestrator().callback({
        provider: 'google', callbackUrl: `https://broker.invalid/google/callback?code=synthetic-code&state=${'A'.repeat(43)}&${key}=injected`,
        verifier: { verify: async () => ({ provider: 'google', upstreamSubject: Buffer.from('never-called'), authenticationTime: 1 }) },
      })).rejects.toThrow('UPSTREAM_CALLBACK_REJECTED')
    }
  })

  it('fails closed on unvalidated browser provider parameters and redirect mismatch', () => {
    const q = orchestrator()
    const provider = new URL(authorizeUrl()); provider.searchParams.set('provider', 'kakao')
    expect(() => q.validate(provider)).toThrow('invalid_request')
    const mismatch = new URL(authorizeUrl()); mismatch.searchParams.set('redirect_uri', `${redirect}/different`)
    expect(() => q.validate(mismatch)).toThrow('invalid_request')
  })
})
