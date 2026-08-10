import type { SocialBrokerErrorCode } from './errors'
import type { LoginAttemptSnapshot } from './attempt'
import type { BrokerLogEvent, BrokerLogEventName } from './types'

export function createBrokerLogEvent(input: Readonly<{
  event: BrokerLogEventName
  attempt: LoginAttemptSnapshot
  at: number
  reason?: SocialBrokerErrorCode
}>): BrokerLogEvent {
  return Object.freeze({
    event: input.event,
    attemptId: input.attempt.id,
    provider: input.attempt.provider,
    state: input.attempt.state,
    at: input.at,
    ...(input.reason ? { reason: input.reason } : {}),
  })
}
export function serializeBrokerLogEvent(event: BrokerLogEvent): string {
  return JSON.stringify(event)
}
