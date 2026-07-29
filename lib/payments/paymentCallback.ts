import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

type State = { paymentTransactionId: string; userId: string; expiresAt: number }

function secret() {
  const value = process.env.PAYMENT_CALLBACK_SECRET
  if (!value || value.length < 32) throw new Error('PAYMENT_CALLBACK_NOT_CONFIGURED')
  return value
}

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

export function createPaymentCallbackState(paymentTransactionId: string, userId: string, now = Date.now()) {
  const payload = encode(JSON.stringify({ paymentTransactionId, userId, expiresAt: now + 15 * 60_000 } satisfies State))
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyPaymentCallbackState(token: string, expectedUserId: string, now = Date.now()): State | null {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  const expected = createHmac('sha256', secret()).update(payload).digest()
  let actual: Buffer
  try { actual = Buffer.from(signature, 'base64url') } catch { return null }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as State
    if (parsed.userId !== expectedUserId || parsed.expiresAt < now || parsed.expiresAt > now + 16 * 60_000 || !/^[0-9a-f-]{36}$/.test(parsed.paymentTransactionId)) return null
    return parsed
  } catch { return null }
}
