import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { ResendRecoveryOtpDeliveryTransport } from './resend-recovery-transport'

describe('Resend recovery transport', () => {
  it('uses the reserved delivery ID for deterministic idempotency and sends only bounded recovery content', async () => {
    const calls: Array<Readonly<{ url: string; init?: RequestInit }>> = []
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response('{}', { status: 200 }) })
    const transport = new ResendRecoveryOtpDeliveryTransport({ apiKey: 'synthetic-key', from: 'SchoolLove <recovery@schoollove.invalid>', fetch: fetcher as unknown as typeof fetch })
    const delivery = { canonicalEmail: 'Case+tag@example.com', otp: '01234567' }
    const context = { deliveryId: '55555555-5555-4555-8555-555555555555' }
    await transport.send(delivery, context); await transport.send(delivery, context)
    const first = calls[0]!.init!; const second = calls[1]!.init!
    expect(calls[0]!.url).toBe('https://api.resend.com/emails')
    expect((first.headers as Record<string, string>)['idempotency-key']).toBe((second.headers as Record<string, string>)['idempotency-key'])
    expect(JSON.parse(first.body as string)).toMatchObject({ to: ['Case+tag@example.com'] })
    expect(first.body).toContain('01234567'); expect(first.body).not.toContain(context.deliveryId)
  })

  it('fails coarsely without retrying on a provider error', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 }))
    const transport = new ResendRecoveryOtpDeliveryTransport({ apiKey: 'synthetic-key', from: 'recovery@schoollove.invalid', fetch: fetcher as typeof fetch })
    await expect(transport.send({ canonicalEmail: 'a@example.com', otp: '12345678' }, { deliveryId: '66666666-6666-4666-8666-666666666666' })).rejects.toThrow('RECOVERY_EMAIL_DELIVERY_FAILED')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
