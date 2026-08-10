import { describe, expect, it } from 'vitest'
import { SocialBrokerError } from './errors'
import {
  FakeGoogleProvider,
  FakeKakaoProvider,
  FakeNaverProvider,
  type FakeUpstreamResponse,
} from './providers'
import { createPkceVerifier } from './pkce'

const NOW = 1_800_000_000

describe('network-free fake upstream providers', () => {
  it.each([
    ['kakao', FakeKakaoProvider, 'oidc', true],
    ['naver', FakeNaverProvider, 'oauth2', false],
    ['google', FakeGoogleProvider, 'oidc', true],
  ] as const)('%s returns only the provider-neutral minimum contract', (_, Provider, protocol, nonceVerified) => {
    const provider = new Provider()
    provider.begin()
    const result = provider.verify(provider.buildResponse({ now: NOW }), NOW)
    expect(result.provider).toBe(provider.provider)
    expect(result.upstreamSubject).toBeInstanceOf(Uint8Array)
    expect(result.issuedAt).toBe(NOW)
    expect(result.authenticationTime).toBe(NOW)
    expect(result.verifiedProtocolEvidence).toMatchObject({ protocol, nonceVerified, pkceMethod: 'S256' })
    expect(Object.keys(result).sort()).toEqual([
      'authenticationTime', 'issuedAt', 'provider', 'upstreamSubject', 'verifiedProtocolEvidence',
    ])
    expect(JSON.stringify(result)).not.toMatch(/email|name|nickname|picture|phone|birthday|gender/i)
  })

  it.each([
    ['invalid_state', 'STATE_REJECTED'],
    ['provider_mismatch', 'PROVIDER_MISMATCH'],
    ['expired_response', 'UPSTREAM_RESPONSE_EXPIRED'],
    ['malformed_subject', 'INVALID_SUBJECT'],
    ['upstream_error', 'UPSTREAM_ERROR'],
  ] as const)('rejects %s', (scenario, code) => {
    const provider = new FakeGoogleProvider()
    provider.begin()
    expect(() => provider.verify(provider.buildResponse({ scenario, now: NOW }), NOW)).toThrowError(
      new SocialBrokerError(code),
    )
  })

  it('rejects nonce mismatch, PKCE downgrade, verifier mismatch, and callback replay', () => {
    const nonceProvider = new FakeKakaoProvider()
    nonceProvider.begin()
    expect(() => nonceProvider.verify(nonceProvider.buildResponse({ scenario: 'invalid_nonce', now: NOW }), NOW))
      .toThrowError(new SocialBrokerError('NONCE_REJECTED'))

    const downgradeProvider = new FakeGoogleProvider()
    downgradeProvider.begin()
    const downgrade = { ...downgradeProvider.buildResponse({ now: NOW }), pkceMethod: 'plain' } as FakeUpstreamResponse
    expect(() => downgradeProvider.verify(downgrade, NOW))
      .toThrowError(new SocialBrokerError('PKCE_DOWNGRADE_REJECTED'))

    const mismatchProvider = new FakeNaverProvider()
    mismatchProvider.begin()
    const mismatch = {
      ...mismatchProvider.buildResponse({ now: NOW }),
      codeVerifier: createPkceVerifier(),
    }
    expect(() => mismatchProvider.verify(mismatch, NOW)).toThrowError(new SocialBrokerError('PKCE_REJECTED'))

    const replayProvider = new FakeGoogleProvider()
    replayProvider.begin()
    const response = replayProvider.buildResponse({ scenario: 'duplicate_callback', now: NOW })
    expect(replayProvider.verify(response, NOW).provider).toBe('google')
    expect(() => replayProvider.verify(response, NOW)).toThrowError(new SocialBrokerError('REPLAY_REJECTED'))
  })
})
