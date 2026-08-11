import { describe, expect, it } from 'vitest'
import { LoginAttempt, LoginAttemptRegistry } from './attempt'
import { SocialBrokerError } from './errors'

const NOW = 1_800_000_000
const attemptId = 'att_1234567890abcdef'

function readyAttempt(): LoginAttempt {
  const attempt = new LoginAttempt({ id: attemptId, provider: 'google', createdAt: NOW, expiresAt: NOW + 300 })
  attempt.startUpstream(NOW)
  attempt.verifyUpstream('google', NOW)
  attempt.requireRecovery(NOW)
  attempt.verifyRecovery(NOW)
  attempt.markAccountDecided(NOW)
  attempt.markAuthPrincipalBound(NOW)
  attempt.markBrokerCodeReady(NOW)
  return attempt
}

describe('login attempt state machine', () => {
  it('permits only the frozen forward path', () => {
    const attempt = readyAttempt()
    expect(attempt.state).toBe('broker_code_ready')
    expect(attempt.consume(NOW).state).toBe('consumed')
    expect(() => attempt.startUpstream(NOW)).toThrowError(new SocialBrokerError('TERMINAL_ATTEMPT_REUSE'))
  })

  it('keeps existing-primary and cross-provider match paths separate from account decision', () => {
    const primary = new LoginAttempt({ provider: 'kakao', createdAt: NOW, expiresAt: NOW + 300 })
    primary.startUpstream(NOW)
    primary.verifyUpstream('kakao', NOW)
    primary.markExistingPrimary(NOW)
    primary.markBrokerCodeReady(NOW)
    expect(primary.consume(NOW).state).toBe('consumed')

    const crossProvider = new LoginAttempt({ provider: 'google', createdAt: NOW, expiresAt: NOW + 300 })
    crossProvider.startUpstream(NOW)
    crossProvider.verifyUpstream('google', NOW)
    crossProvider.requireRecovery(NOW)
    crossProvider.verifyRecovery(NOW)
    crossProvider.markExistingAccountMatch(NOW)
    expect(() => crossProvider.markBrokerCodeReady(NOW)).toThrowError(new SocialBrokerError('INVALID_ATTEMPT_TRANSITION'))
  })

  it('rejects skipped transitions and makes terminal failures non-reusable', () => {
    const attempt = new LoginAttempt({ provider: 'kakao', createdAt: NOW, expiresAt: NOW + 300 })
    expect(() => attempt.verifyRecovery(NOW)).toThrowError(new SocialBrokerError('INVALID_ATTEMPT_TRANSITION'))
    attempt.reject('failed_safe')
    expect(() => attempt.startUpstream(NOW)).toThrowError(new SocialBrokerError('TERMINAL_ATTEMPT_REUSE'))
    expect(() => attempt.reject('cancelled')).toThrowError(new SocialBrokerError('TERMINAL_ATTEMPT_REUSE'))
  })

  it('binds the provider and expires fail-closed', () => {
    const mismatch = new LoginAttempt({ provider: 'naver', createdAt: NOW, expiresAt: NOW + 300 })
    mismatch.startUpstream(NOW)
    expect(() => mismatch.verifyUpstream('google', NOW)).toThrowError(new SocialBrokerError('PROVIDER_MISMATCH'))
    expect(mismatch.state).toBe('provider_mismatch')

    const expired = new LoginAttempt({ provider: 'kakao', createdAt: NOW, expiresAt: NOW + 1 })
    expect(() => expired.startUpstream(NOW + 1)).toThrowError(new SocialBrokerError('ATTEMPT_EXPIRED'))
    expect(expired.state).toBe('expired')
  })

  it('rejects attempt ID reuse even after the first attempt is terminal', () => {
    const registry = new LoginAttemptRegistry()
    const first = new LoginAttempt({ id: attemptId, provider: 'google', createdAt: NOW, expiresAt: NOW + 300 })
    const second = new LoginAttempt({ id: attemptId, provider: 'google', createdAt: NOW, expiresAt: NOW + 300 })
    registry.register(first)
    first.reject('cancelled')
    expect(() => registry.register(second)).toThrowError(new SocialBrokerError('ATTEMPT_ID_REUSED'))
  })

  it('allows exactly one concurrent consume', async () => {
    const attempt = readyAttempt()
    const results = await Promise.allSettled([
      Promise.resolve().then(() => attempt.consume(NOW)),
      Promise.resolve().then(() => attempt.consume(NOW)),
      Promise.resolve().then(() => attempt.consume(NOW)),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2)
  })
})
