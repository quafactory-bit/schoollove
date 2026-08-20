import 'server-only'
import { prepareAttemptRecoveryChallenge, type PreparedAttemptRecoveryChallenge } from './recovery-preparation'
import type { VersionedKey } from './recovery'

/** Server-only transport boundary implemented by injected fake or real delivery adapters. */
export interface RecoveryOtpDeliveryTransport {
  send(input: Readonly<{ canonicalEmail: string; otp: string }>, context?: Readonly<{ deliveryId: string }>): Promise<void>
}

export type RecoveryDeliveryReservation = Readonly<{
  outcome: 'RECOVERY_DELIVERY_RESERVED' | 'RECOVERY_DELIVERY_LIMITED'
  verificationId?: string
  deliveryId?: string
}>

/** Service-only DB adapter. It never receives the raw destination or OTP. */
export interface RecoveryDeliveryDatabase {
  createAndReserve(input: PreparedAttemptRecoveryChallenge['database'] & Readonly<{ attemptId: string }>): Promise<RecoveryDeliveryReservation>
  markSent(deliveryId: string): Promise<void>
  fail(deliveryId: string): Promise<void>
}

export type RecoveryDeliveryResult = Readonly<{ state: 'limited' | 'sent' | 'failed'; verificationId?: string; deliveryId?: string }>

/**
 * Reserves the DB slot before transport. On a transport failure the same slot is
 * terminally failed; its budget is deliberately never refunded.
 */
export async function prepareAndDeliverAttemptRecovery(input: Readonly<{
  attemptId: string
  recoveryEmail: string
  recoveryHmacKey: VersionedKey
  recoveryEncryptionKey: VersionedKey
  otpMacKey: VersionedKey
  database: RecoveryDeliveryDatabase
  transport: RecoveryOtpDeliveryTransport
}>): Promise<RecoveryDeliveryResult> {
  const prepared = prepareAttemptRecoveryChallenge(input)
  const reserved = await input.database.createAndReserve({ attemptId: input.attemptId, ...prepared.database })
  if (reserved.outcome !== 'RECOVERY_DELIVERY_RESERVED' || !reserved.verificationId || !reserved.deliveryId) return Object.freeze({ state: 'limited' })
  try {
    await input.transport.send(prepared.delivery, { deliveryId: reserved.deliveryId })
    await input.database.markSent(reserved.deliveryId)
    return Object.freeze({ state: 'sent', verificationId: reserved.verificationId, deliveryId: reserved.deliveryId })
  } catch {
    // The transport is never retried here. A stale confirmation may race with
    // terminalization, so cleanup failure is deliberately coarse and cannot
    // trigger another external send or resurrect a challenge.
    try { await input.database.fail(reserved.deliveryId) } catch {}
    return Object.freeze({ state: 'failed', verificationId: reserved.verificationId, deliveryId: reserved.deliveryId })
  }
}

/** Deterministic in-memory test transport; it never performs network I/O. */
export class InMemoryRecoveryOtpDeliveryTransport implements RecoveryOtpDeliveryTransport {
  readonly deliveries: Array<Readonly<{ canonicalEmail: string; otp: string }>> = []
  constructor(private readonly fail = false) {}
  async send(input: Readonly<{ canonicalEmail: string; otp: string }>): Promise<void> {
    if (this.fail) throw new Error('FAKE_RECOVERY_DELIVERY_FAILED')
    this.deliveries.push(Object.freeze({ canonicalEmail: input.canonicalEmail, otp: input.otp }))
  }
}
