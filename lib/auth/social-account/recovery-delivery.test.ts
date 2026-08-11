import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { InMemoryRecoveryOtpDeliveryTransport, prepareAndDeliverAttemptRecovery, type RecoveryDeliveryDatabase } from './recovery-delivery'

const keys = { recoveryHmacKey: { version: 1, material: new Uint8Array(32).fill(1) }, recoveryEncryptionKey: { version: 1, material: new Uint8Array(32).fill(2) }, otpMacKey: { version: 1, material: new Uint8Array(32).fill(3) } }
function db(outcome: 'RECOVERY_DELIVERY_RESERVED' | 'RECOVERY_DELIVERY_LIMITED' = 'RECOVERY_DELIVERY_RESERVED') {
  return { createAndReserve: vi.fn(async () => outcome === 'RECOVERY_DELIVERY_RESERVED' ? { outcome, verificationId: 'v', deliveryId: 'd' } : { outcome }), markSent: vi.fn(async () => undefined), fail: vi.fn(async () => undefined) } satisfies RecoveryDeliveryDatabase
}

describe('recovery delivery orchestration', () => {
  it('reserves before fake send then marks sent without persisting raw delivery data', async () => {
    const database = db(); const transport = new InMemoryRecoveryOtpDeliveryTransport()
    await expect(prepareAndDeliverAttemptRecovery({ attemptId: 'attempt', recoveryEmail: 'User+tag@example.com', database, transport, ...keys })).resolves.toMatchObject({ state: 'sent' })
    expect(database.createAndReserve).toHaveBeenCalledOnce()
    expect(database.markSent).toHaveBeenCalledWith('d'); expect(transport.deliveries).toHaveLength(1)
  })
  it('does not call transport when the atomic reservation is limited', async () => {
    const database = db('RECOVERY_DELIVERY_LIMITED'); const transport = new InMemoryRecoveryOtpDeliveryTransport()
    await expect(prepareAndDeliverAttemptRecovery({ attemptId: 'attempt', recoveryEmail: 'a@example.com', database, transport, ...keys })).resolves.toEqual({ state: 'limited' })
    expect(transport.deliveries).toHaveLength(0); expect(database.markSent).not.toHaveBeenCalled(); expect(database.fail).not.toHaveBeenCalled()
  })
  it('fails the reserved delivery after a fake transport error', async () => {
    const database = db(); const transport = new InMemoryRecoveryOtpDeliveryTransport(true)
    await expect(prepareAndDeliverAttemptRecovery({ attemptId: 'attempt', recoveryEmail: 'a@example.com', database, transport, ...keys })).resolves.toMatchObject({ state: 'failed' })
    expect(database.fail).toHaveBeenCalledWith('d'); expect(database.markSent).not.toHaveBeenCalled()
  })
  it('does not resend or resurrect when sent confirmation and stale cleanup both fail', async () => {
    const database = db(); database.markSent.mockRejectedValueOnce(new Error('STALE_CONFIRMATION')); database.fail.mockRejectedValueOnce(new Error('STALE_TERMINAL'))
    const transport = new InMemoryRecoveryOtpDeliveryTransport()
    await expect(prepareAndDeliverAttemptRecovery({ attemptId: 'attempt', recoveryEmail: 'a@example.com', database, transport, ...keys })).resolves.toMatchObject({ state: 'failed' })
    expect(transport.deliveries).toHaveLength(1); expect(database.markSent).toHaveBeenCalledTimes(1); expect(database.fail).toHaveBeenCalledTimes(1)
  })
  it('remains server-only and has no provider transport implementation', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./recovery-delivery.ts', import.meta.url), 'utf8'))
    expect(source.startsWith("import 'server-only'")).toBe(true)
    expect(source).not.toMatch(/sendgrid|resend|smtp|postmark|mailgun|fetch\(/i)
  })
})
