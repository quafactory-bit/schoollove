import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PaymentWebhookHeaders } from './PaymentProvider'

const TOLERANCE_SECONDS = 5 * 60

function header(headers: PaymentWebhookHeaders, name: string) {
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  return found?.[1] ?? null
}

function secretBytes(secret: string) {
  const value = secret.startsWith('whsec_') ? secret.slice(6) : secret
  try {
    const decoded = Buffer.from(value, 'base64')
    if (decoded.length >= 24) return decoded
  } catch {}
  return Buffer.from(value, 'utf8')
}

export function signStandardWebhook(rawBody: string, headers: PaymentWebhookHeaders, secret: string) {
  const id = header(headers, 'webhook-id')
  const timestamp = header(headers, 'webhook-timestamp')
  if (!id || !timestamp) throw new Error('WEBHOOK_HEADERS_REQUIRED')
  return createHmac('sha256', secretBytes(secret)).update(`${id}.${timestamp}.${rawBody}`).digest('base64')
}

export function verifyStandardWebhook(rawBody: string, headers: PaymentWebhookHeaders, secret: string, nowMs = Date.now()) {
  const id = header(headers, 'webhook-id')
  const timestamp = header(headers, 'webhook-timestamp')
  const signature = header(headers, 'webhook-signature')
  if (!id || !timestamp || !signature || !/^\d{10}$/.test(timestamp)) return false
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > TOLERANCE_SECONDS) return false
  const expected = Buffer.from(signStandardWebhook(rawBody, headers, secret), 'base64')
  return signature.split(' ').some((candidate) => {
    const [version, encoded] = candidate.split(',', 2)
    if (version !== 'v1' || !encoded) return false
    try {
      const actual = Buffer.from(encoded, 'base64')
      return actual.length === expected.length && timingSafeEqual(actual, expected)
    } catch {
      return false
    }
  })
}

export function getStandardWebhookId(headers: PaymentWebhookHeaders) {
  return header(headers, 'webhook-id')
}
