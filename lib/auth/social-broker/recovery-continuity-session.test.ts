import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { openRecoveryContinuity, recoveryContinuityCookie, sealRecoveryContinuity } from './recovery-continuity-session'

const key = { version: 1 as const, material: Buffer.alloc(32, 21) }
const base = { stage: 'recovery_required' as const, provider: 'google' as const, trustedAttemptId: '33333333-3333-4333-8333-333333333333', brokerSubject: `slb:v1:k01:google:${'C'.repeat(43)}`, authenticationTime: 100, verificationId: null, issuedAt: 100, expiresAt: 700 }

describe('Preview recovery continuity', () => {
  it('seals private authority in a bounded HttpOnly cookie and rejects tamper, expiry, and stage replay', () => {
    const sealed = sealRecoveryContinuity(base, key)
    expect(sealed).not.toContain(base.trustedAttemptId); expect(sealed).not.toContain(base.brokerSubject)
    expect(openRecoveryContinuity(sealed, key, 699)).toEqual(base)
    expect(() => openRecoveryContinuity(`${sealed}x`, key, 699)).toThrow('SOCIAL_RECOVERY_CONTINUITY_REJECTED')
    expect(() => openRecoveryContinuity(sealed, key, 700)).toThrow('SOCIAL_RECOVERY_CONTINUITY_REJECTED')
    expect(recoveryContinuityCookie.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 })
  })

  it('requires a verification authority only at otp_sent stage', () => {
    expect(() => sealRecoveryContinuity({ ...base, stage: 'otp_sent' }, key)).toThrow('SOCIAL_RECOVERY_CONTINUITY_REJECTED')
    const sent = sealRecoveryContinuity({ ...base, stage: 'otp_sent', verificationId: '44444444-4444-4444-8444-444444444444' }, key)
    expect(openRecoveryContinuity(sent, key, 101)).toMatchObject({ stage: 'otp_sent', verificationId: '44444444-4444-4444-8444-444444444444' })
  })
})
