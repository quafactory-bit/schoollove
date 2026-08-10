import { brokerFailure, SocialBrokerError } from './errors'
import { createNonceLeg, type NonceBinding } from './nonce'
import { calculateS256Challenge, createPkceVerifier, requireS256, verifyPkce } from './pkce'
import { createStateLeg, type StateBinding } from './state'
import type { SocialProvider, VerifiedUpstreamIdentity } from './types'

export type FakeProviderScenario =
  | 'success'
  | 'invalid_state'
  | 'provider_mismatch'
  | 'invalid_nonce'
  | 'expired_response'
  | 'duplicate_callback'
  | 'replay'
  | 'malformed_subject'
  | 'upstream_error'

export type FakeAuthorizationLeg = Readonly<{
  provider: SocialProvider
  protocol: 'oidc' | 'oauth2'
  state: string
  codeVerifier: string
  codeChallenge: string
  nonce: string | null
}>

export type FakeUpstreamResponse = Readonly<{
  provider: SocialProvider
  upstreamSubject: Uint8Array
  state: string
  nonce: string | null
  codeVerifier: string
  pkceMethod: 'S256' | 'plain'
  issuedAt: number
  authenticationTime: number
  upstreamError: boolean
}>

export interface UpstreamProviderAdapter {
  readonly provider: SocialProvider
  begin(): FakeAuthorizationLeg
  verify(response: FakeUpstreamResponse, now: number): VerifiedUpstreamIdentity
}
const otherProvider = (provider: SocialProvider): SocialProvider =>
  provider === 'kakao' ? 'naver' : provider === 'naver' ? 'google' : 'kakao'

abstract class FakeProviderBase implements UpstreamProviderAdapter {
  abstract readonly provider: SocialProvider
  abstract readonly protocol: 'oidc' | 'oauth2'
  #stateBinding: StateBinding | null = null
  #nonceBinding: NonceBinding | null = null
  #leg: FakeAuthorizationLeg | null = null
  #callbackConsumed = false

  begin(): FakeAuthorizationLeg {
    if (this.#leg) brokerFailure('REPLAY_REJECTED')
    const stateLeg = createStateLeg()
    const verifier = createPkceVerifier()
    const nonceLeg = this.protocol === 'oidc' ? createNonceLeg() : null
    this.#stateBinding = stateLeg.binding
    this.#nonceBinding = nonceLeg?.binding ?? null
    this.#leg = Object.freeze({
      provider: this.provider,
      protocol: this.protocol,
      state: stateLeg.rawState,
      codeVerifier: verifier,
      codeChallenge: calculateS256Challenge(verifier),
      nonce: nonceLeg?.rawNonce ?? null,
    })
    return this.#leg
  }

  buildResponse(input: Readonly<{
    scenario?: FakeProviderScenario
    syntheticSubject?: Uint8Array
    now: number
  }>): FakeUpstreamResponse {
    if (!this.#leg) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    const scenario = input.scenario ?? 'success'
    return Object.freeze({
      provider: scenario === 'provider_mismatch' ? otherProvider(this.provider) : this.provider,
      upstreamSubject: scenario === 'malformed_subject'
        ? new Uint8Array()
        : input.syntheticSubject ?? Buffer.from(`synthetic-${this.provider}-subject`, 'utf8'),
      state: scenario === 'invalid_state' ? `${this.#leg.state}x` : this.#leg.state,
      nonce: scenario === 'invalid_nonce' ? `${this.#leg.nonce ?? ''}x` : this.#leg.nonce,
      codeVerifier: this.#leg.codeVerifier,
      pkceMethod: 'S256',
      issuedAt: scenario === 'expired_response' ? input.now - 301 : input.now,
      authenticationTime: scenario === 'expired_response' ? input.now - 301 : input.now,
      upstreamError: scenario === 'upstream_error',
    })
  }

  verify(response: FakeUpstreamResponse, now: number): VerifiedUpstreamIdentity {
    if (!this.#leg || !this.#stateBinding) brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    if (this.#callbackConsumed) brokerFailure('REPLAY_REJECTED')
    this.#callbackConsumed = true
    if (response.provider !== this.provider) brokerFailure('PROVIDER_MISMATCH')
    if (response.upstreamError) brokerFailure('UPSTREAM_ERROR')
    try {
      if (!this.#stateBinding.verifyAndConsume(response.state)) brokerFailure('STATE_REJECTED')
    } catch (error) {
      if (error instanceof SocialBrokerError && error.code === 'REPLAY_REJECTED') throw error
      throw error
    }
    requireS256(response.pkceMethod)
    if (!verifyPkce(response.codeVerifier, this.#leg.codeChallenge)) brokerFailure('PKCE_REJECTED')
    if (this.protocol === 'oidc') {
      if (!this.#nonceBinding || response.nonce === null) brokerFailure('NONCE_REJECTED')
      if (!this.#nonceBinding.verifyAndConsume(response.nonce)) brokerFailure('NONCE_REJECTED')
    }
    if (response.issuedAt < now - 300 || response.issuedAt > now + 30) {
      brokerFailure('UPSTREAM_RESPONSE_EXPIRED')
    }
    if (response.authenticationTime > response.issuedAt || response.authenticationTime < 0) {
      brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    }
    if (!(response.upstreamSubject instanceof Uint8Array) || response.upstreamSubject.byteLength === 0) {
      brokerFailure('INVALID_SUBJECT')
    }
    return Object.freeze({
      provider: this.provider,
      upstreamSubject: Uint8Array.from(response.upstreamSubject),
      issuedAt: response.issuedAt,
      authenticationTime: response.authenticationTime,
      verifiedProtocolEvidence: Object.freeze({
        protocol: this.protocol,
        issuer: `urn:schoollove:fake-upstream:${this.provider}`,
        audience: 'urn:schoollove:fake-broker',
        stateVerified: true,
        pkceMethod: 'S256',
        nonceVerified: this.protocol === 'oidc',
      }),
    })
  }
}

/** Test-only adapter. It never performs a network request. */
export class FakeKakaoProvider extends FakeProviderBase {
  readonly provider = 'kakao' as const
  readonly protocol = 'oidc' as const
}

/** Test-only adapter. It never performs a network request. */
export class FakeNaverProvider extends FakeProviderBase {
  readonly provider = 'naver' as const
  readonly protocol = 'oauth2' as const
}

/** Test-only adapter. It never performs a network request. */
export class FakeGoogleProvider extends FakeProviderBase {
  readonly provider = 'google' as const
  readonly protocol = 'oidc' as const
}
