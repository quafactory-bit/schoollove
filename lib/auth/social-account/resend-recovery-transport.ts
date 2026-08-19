import 'server-only'
import { createHash } from 'node:crypto'
import type { RecoveryOtpDeliveryTransport } from './recovery-delivery'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OTP = /^[0-9]{8}$/

/** Server-only Resend boundary. The reserved delivery UUID is reduced to a
 * purpose-bound digest before it leaves the process as an idempotency key. */
export class ResendRecoveryOtpDeliveryTransport implements RecoveryOtpDeliveryTransport {
  constructor(private readonly input: Readonly<{ apiKey: string; from: string; fetch?: typeof fetch }>) {
    if (!input.apiKey || !input.from || /[\r\n]/.test(input.from)) throw new Error('RECOVERY_EMAIL_TRANSPORT_INVALID')
  }

  async send(message: Readonly<{ canonicalEmail: string; otp: string }>, context?: Readonly<{ deliveryId: string }>): Promise<void> {
    if (!context || !UUID.test(context.deliveryId) || !OTP.test(message.otp)) throw new Error('RECOVERY_EMAIL_TRANSPORT_INVALID')
    const idempotencyKey = createHash('sha256').update('schoollove:recovery-delivery:v1\0').update(context.deliveryId).digest('base64url')
    const response = await (this.input.fetch ?? fetch)(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.input.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `schoollove-recovery-${idempotencyKey}`,
      },
      body: JSON.stringify({
        from: this.input.from,
        to: [message.canonicalEmail],
        subject: 'SchoolLove 복구 이메일 인증번호',
        text: `SchoolLove 복구 확인을 위한 인증번호는 ${message.otp} 입니다. 인증번호는 10분 이내에 사용하고 다른 사람과 공유하지 마세요.`,
      }),
      redirect: 'error',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('RECOVERY_EMAIL_DELIVERY_FAILED')
  }
}
