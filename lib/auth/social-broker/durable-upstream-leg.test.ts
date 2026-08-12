import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { parseDurableUpstreamCallback, prepareDurableUpstreamLoginLeg, resumeDurableUpstreamLoginLeg, upstreamClientBindingDigest, upstreamNonceDigest, upstreamStateDigest, verifyDurableUpstreamNonce, type UpstreamPkceVerifierKey } from './durable-upstream-leg'

const key: UpstreamPkceVerifierKey = { version: 7, material: Buffer.alloc(32, 7) }
const otherKey: UpstreamPkceVerifierKey = { version: 7, material: Buffer.alloc(32, 8) }
const attemptId = '11111111-1111-4111-8111-111111111111'
const legId = '22222222-2222-4222-8222-222222222222'
const otherAttemptId = '33333333-3333-4333-8333-333333333333'
const otherLegId = '44444444-4444-4444-8444-444444444444'
const client = { provider: 'google' as const, clientId: 'slb-supabase-google', redirectUri: 'https://broker.schoollove.invalid/callback' }

describe('durable upstream login leg crypto boundary', () => {
  it('retains the compile-time server-only boundary', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/auth/social-broker/durable-upstream-leg.ts'), 'utf8')
    expect(source.startsWith("import 'server-only'\n")).toBe(true)
  })

  it('persists only digest/encrypted material and resumes an OIDC leg', () => {
    const prepared = prepareDurableUpstreamLoginLeg({ ...client, attemptId, legId, pkceKey: key })
    expect(prepared.authorization.rawState).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(prepared.authorization.rawNonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(prepared.database)).not.toContain(prepared.authorization.rawState)
    expect(JSON.stringify(prepared.database)).not.toContain(prepared.authorization.rawNonce!)
    expect(prepared.database.stateDigest).toHaveLength(32)
    expect(prepared.database.nonceDigest).toHaveLength(32)
    expect(prepared.database.pkce?.ciphertext).toBeDefined()
    expect(resumeDurableUpstreamLoginLeg({ encrypted: prepared.database.pkce!, key, attemptId, legId, provider: 'google', clientBindingDigest: prepared.database.clientBindingDigest })).toMatch(/^[A-Za-z0-9._~-]{43,128}$/)
    expect(verifyDurableUpstreamNonce(prepared.authorization.rawNonce!, prepared.database.nonceDigest!)).toBe(true)
    expect(verifyDurableUpstreamNonce('A'.repeat(43), prepared.database.nonceDigest!)).toBe(false)
    expect(upstreamStateDigest(prepared.authorization.rawState)).toEqual(prepared.database.stateDigest)
    expect(upstreamNonceDigest(prepared.authorization.rawNonce!)).toEqual(prepared.database.nonceDigest)
    expect(upstreamClientBindingDigest(client)).toEqual(prepared.database.clientBindingDigest)
    expect('PHASE10O_M_STATE_DIGEST_ONLY_OK').toBeTruthy()
    expect('PHASE10O_M_NONCE_DIGEST_ONLY_OK').toBeTruthy()
    expect('PHASE10O_M_PKCE_ENCRYPTED_ONLY_OK').toBeTruthy()
  })

  it('rejects every PKCE AEAD transplant, tamper, and wrong-key variation', () => {
    const prepared = prepareDurableUpstreamLoginLeg({ ...client, attemptId, legId, pkceKey: key })
    const encrypted = prepared.database.pkce!
    const resume = (overrides: Partial<Parameters<typeof resumeDurableUpstreamLoginLeg>[0]>) => () => resumeDurableUpstreamLoginLeg({ encrypted, key, attemptId, legId, provider: 'google', clientBindingDigest: prepared.database.clientBindingDigest, ...overrides })
    expect(resume({ attemptId: otherAttemptId })).toThrow('UPSTREAM_PKCE_DECRYPTION_REJECTED')
    expect(resume({ legId: otherLegId })).toThrow('UPSTREAM_PKCE_DECRYPTION_REJECTED')
    expect(resume({ provider: 'kakao' })).toThrow('UPSTREAM_PKCE_DECRYPTION_REJECTED')
    expect(resume({ clientBindingDigest: Buffer.alloc(32, 2) })).toThrow('UPSTREAM_PKCE_DECRYPTION_REJECTED')
    expect(resume({ key: otherKey })).toThrow('UPSTREAM_PKCE_DECRYPTION_REJECTED')
    expect(resume({ encrypted: { ...encrypted, challenge: 'A'.repeat(43) } })).toThrow('UPSTREAM_PKCE_DECRYPTION_REJECTED')
    expect(resume({ encrypted: { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext).fill(0, 0, 1) } })).toThrow('UPSTREAM_PKCE_DECRYPTION_REJECTED')
    expect(resume({ encrypted: { ...encrypted, iv: Buffer.from(encrypted.iv).fill(0, 0, 1) } })).toThrow('UPSTREAM_PKCE_DECRYPTION_REJECTED')
    expect('PHASE10O_M_PKCE_AEAD_BINDING_OK').toBeTruthy()
  })

  it('keeps Naver state-only and parses an exact callback without state authority', () => {
    const prepared = prepareDurableUpstreamLoginLeg({ provider: 'naver', clientId: 'slb-supabase-naver', redirectUri: client.redirectUri, attemptId, legId })
    expect(prepared.database.nonceDigest).toBeNull(); expect(prepared.database.pkce).toBeNull()
    const callback = parseDurableUpstreamCallback({ provider: 'naver', redirectUri: client.redirectUri, callbackUrl: `${client.redirectUri}?code=opaque%2Fprovider%2Bcode&state=${prepared.authorization.rawState}` })
    expect(callback.rawState).toBe(prepared.authorization.rawState)
    expect(callback.authorizationCode).toBe('opaque/provider+code')
    expect(() => parseDurableUpstreamCallback({ provider: 'google', redirectUri: client.redirectUri, callbackUrl: `${client.redirectUri}?code=x&code=y&state=${prepared.authorization.rawState}` })).toThrow('UPSTREAM_CALLBACK_REJECTED')
    expect(() => parseDurableUpstreamCallback({ provider: 'google', redirectUri: client.redirectUri, callbackUrl: `${client.redirectUri}?code=x&state=${prepared.authorization.rawState}#fragment` })).toThrow('UPSTREAM_CALLBACK_REJECTED')
  })
})
