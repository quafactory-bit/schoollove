import { randomBytes } from 'node:crypto'
import { brokerFailure } from './errors'
import {
  LOGIN_ATTEMPT_TERMINAL_FAILURE_STATES,
  type LoginAttemptState,
  type LoginAttemptTerminalFailureState,
  type SocialProvider,
} from './types'

const ATTEMPT_ID_PATTERN = /^att_[A-Za-z0-9_-]{16,64}$/
const terminalFailures = new Set<LoginAttemptState>(LOGIN_ATTEMPT_TERMINAL_FAILURE_STATES)

const allowedTransitions: Readonly<Record<string, readonly LoginAttemptState[]>> = {
  created: ['upstream_pending'],
  upstream_pending: ['upstream_verified'],
  upstream_verified: ['recovery_required', 'existing_primary'],
  recovery_required: ['recovery_pending'],
  recovery_pending: ['recovery_verified'],
  recovery_verified: ['account_decided', 'existing_account_match'],
  account_decided: ['auth_principal_bound'],
  auth_principal_bound: ['broker_code_ready'],
  existing_primary: ['broker_code_ready'],
  existing_account_match: [],
  broker_code_ready: ['consumed'],
}
export type LoginAttemptSnapshot = Readonly<{
  id: string
  provider: SocialProvider
  state: LoginAttemptState
  createdAt: number
  expiresAt: number
  version: number
}>

export class LoginAttempt {
  readonly id: string
  readonly provider: SocialProvider
  readonly createdAt: number
  readonly expiresAt: number
  #state: LoginAttemptState = 'created'
  #version = 0

  constructor(input: Readonly<{
    id?: string
    provider: SocialProvider
    createdAt: number
    expiresAt: number
  }>) {
    this.id = input.id ?? `att_${randomBytes(18).toString('base64url')}`
    if (!ATTEMPT_ID_PATTERN.test(this.id)) brokerFailure('INVALID_ATTEMPT_ID')
    if (!Number.isSafeInteger(input.createdAt) || input.expiresAt <= input.createdAt) {
      brokerFailure('UPSTREAM_RESPONSE_MALFORMED')
    }
    this.provider = input.provider
    this.createdAt = input.createdAt
    this.expiresAt = input.expiresAt
  }

  get state(): LoginAttemptState {
    return this.#state
  }

  snapshot(): LoginAttemptSnapshot {
    return Object.freeze({
      id: this.id,
      provider: this.provider,
      state: this.#state,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      version: this.#version,
    })
  }

  startUpstream(now: number): void {
    this.#transition('upstream_pending', now)
  }

  verifyUpstream(provider: SocialProvider, now: number): void {
    if (provider !== this.provider) {
      this.reject('provider_mismatch')
      brokerFailure('PROVIDER_MISMATCH')
    }
    this.#transition('upstream_verified', now)
  }

  requireRecovery(now: number): void {
    this.#transition('recovery_required', now)
  }

  verifyRecovery(now: number): void {
    this.#transition('recovery_pending', now)
    this.#transition('recovery_verified', now)
  }

  markAccountDecided(now: number): void { this.#transition('account_decided', now) }

  markAuthPrincipalBound(now: number): void { this.#transition('auth_principal_bound', now) }

  markExistingPrimary(now: number): void { this.#transition('existing_primary', now) }

  markExistingAccountMatch(now: number): void { this.#transition('existing_account_match', now) }

  markBrokerCodeReady(now: number): void {
    this.#transition('broker_code_ready', now)
  }

  consume(now: number): LoginAttemptSnapshot {
    this.#transition('consumed', now)
    return this.snapshot()
  }

  reject(state: LoginAttemptTerminalFailureState): LoginAttemptSnapshot {
    if (this.#state === 'consumed' || terminalFailures.has(this.#state)) {
      brokerFailure('TERMINAL_ATTEMPT_REUSE')
    }
    this.#state = state
    this.#version += 1
    return this.snapshot()
  }

  #transition(next: LoginAttemptState, now: number): void {
    if (this.#state === 'consumed' || terminalFailures.has(this.#state)) {
      brokerFailure('TERMINAL_ATTEMPT_REUSE')
    }
    if (now >= this.expiresAt) {
      this.#state = 'expired'
      this.#version += 1
      brokerFailure('ATTEMPT_EXPIRED')
    }
    if (!allowedTransitions[this.#state]?.includes(next)) brokerFailure('INVALID_ATTEMPT_TRANSITION')
    this.#state = next
    this.#version += 1
  }
}

export class LoginAttemptRegistry {
  #attempts = new Map<string, LoginAttempt>()

  register(attempt: LoginAttempt): void {
    if (this.#attempts.has(attempt.id)) brokerFailure('ATTEMPT_ID_REUSED')
    this.#attempts.set(attempt.id, attempt)
  }

  get(id: string): LoginAttempt | undefined {
    return this.#attempts.get(id)
  }
}
