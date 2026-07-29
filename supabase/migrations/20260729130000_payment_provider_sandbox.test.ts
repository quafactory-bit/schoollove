import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260729130000_payment_provider_sandbox.sql'), 'utf8')

describe('PHASE 10G payment migration', () => {
  it('adds payment, webhook, refund, and document structures', () => {
    for (const name of ['payment_transactions','payment_webhook_events','payment_refund_attempts','payment_document_requests']) expect(sql).toContain(`CREATE TABLE public.${name}`)
  })

  it('confirms only exact server-verified KRW payment state atomically', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.confirm_verified_payment')
    expect(sql).toContain('verified_amount<>payment_row.amount_krw')
    expect(sql).toContain("verified_currency<>payment_row.currency")
    expect(sql).toContain("status='payment_confirmed'")
  })

  it('uses replay protection, raw-payload hashing, RLS, FORCE RLS and service-only mutations', () => {
    expect(sql).toContain('UNIQUE(provider,event_id)')
    expect(sql).toContain('payload_sha256')
    expect(sql).not.toMatch(/raw_payload|card_number|account_number|buyer_email|buyer_phone/i)
    expect(sql.match(/FORCE ROW LEVEL SECURITY/g)?.length).toBeGreaterThanOrEqual(1)
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.confirm_verified_payment')
  })
})
