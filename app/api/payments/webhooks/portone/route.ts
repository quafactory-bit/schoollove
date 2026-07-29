import { NextRequest, NextResponse } from 'next/server'
import { processPaymentWebhook } from '@/lib/paymentOperations'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'UNSUPPORTED_CONTENT_TYPE' }, { status: 415 })
  const rawBody = await request.text()
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > 256_000) return NextResponse.json({ error: 'INVALID_WEBHOOK_BODY' }, { status: 400 })
  const headers = {
    'webhook-id': request.headers.get('webhook-id'),
    'webhook-timestamp': request.headers.get('webhook-timestamp'),
    'webhook-signature': request.headers.get('webhook-signature'),
  }
  const result = await processPaymentWebhook('portone_sandbox', rawBody, headers)
  return NextResponse.json({ received: result.status === 200, code: result.code }, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
}
