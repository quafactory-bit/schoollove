import { describe, expect, it } from 'vitest'
import { createBetaInviteToken, hashBetaIdentity } from './beta'

describe('PHASE 10F beta identity safety', () => {
  it('normalizes identity before hashing', () => {
    expect(hashBetaIdentity(' Test@Example.com ')).toBe(hashBetaIdentity('test@example.com'))
    expect(hashBetaIdentity('test@example.com')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('creates high entropy URL-safe invite tokens', () => {
    const first=createBetaInviteToken(); const second=createBetaInviteToken()
    expect(first).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(first).not.toBe(second)
  })
})
