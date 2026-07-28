import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./20260728230000_promotion_operations_automation.sql', import.meta.url), 'utf8')
const tables = [
  'promotion_products', 'promotion_quotes', 'promotion_commercial_orders', 'promotion_order_status_history',
  'promotion_payment_submissions', 'promotion_payment_confirmations', 'promotion_cancellation_requests',
  'promotion_refunds', 'promotion_notification_outbox', 'promotion_performance_reports',
]

describe('PHASE 10E promotion operations migration', () => {
  it('stores an administrator product catalog and immutable quote/order price snapshots', () => {
    expect(sql).toContain('CREATE TABLE public.promotion_products')
    expect(sql).toContain('base_price_krw integer NOT NULL')
    expect(sql).toContain('price_policy_version text NOT NULL')
    expect(sql.match(/product_snapshot jsonb NOT NULL/g)).toHaveLength(2)
    expect(sql).not.toMatch(/DEFAULT\s+(?:10000|50000|150000|300000)\b/)
  })

  it('implements quote, order, manual payment, cancellation, refund, calendar, outbox, and aggregate report state', () => {
    for (const table of tables) expect(sql).toContain(`CREATE TABLE public.${table}`)
    for (const name of [
      'admin_approve_and_quote_promotion_request', 'respond_own_promotion_quote', 'submit_manual_payment_notice',
      'admin_confirm_manual_payment', 'request_promotion_cancellation', 'admin_decide_promotion_cancellation',
      'admin_confirm_promotion_refund', 'admin_schedule_promotion_order', 'admin_set_promotion_order_delivery',
      'admin_generate_promotion_report', 'admin_update_promotion_notification',
    ]) expect(sql).toContain(`FUNCTION public.${name}`)
  })

  it('forces RLS and keeps tables and mutations service-role only', () => {
    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`)
    }
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC,anon,authenticated;/)
    expect(sql).not.toMatch(/GRANT (?:ALL|INSERT|UPDATE|DELETE) ON TABLE[^;]+TO (?:PUBLIC|anon|authenticated)/)
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]+ TO (?:PUBLIC|anon|authenticated)/)
  })

  it('keeps payment manual and stores no account, card, webhook, or raw visitor identity fields', () => {
    expect(sql).toContain("payment_provider text NOT NULL DEFAULT 'manual'")
    expect(sql).not.toMatch(/account_number|card_number|card_token|bank_name|webhook_secret|raw_ip|user_agent/i)
    expect(sql).toContain("idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$')")
  })

  it('prevents active quote, order, slot, payment notice, cancellation, and replay duplicates', () => {
    expect(sql).toContain('promotion_quotes_one_open_per_request')
    expect(sql).toContain('quote_id uuid NOT NULL UNIQUE')
    expect(sql).toContain('request_id uuid NOT NULL UNIQUE')
    expect(sql).toContain('promotion_payment_one_pending_notice')
    expect(sql).toContain('promotion_cancellation_one_pending')
    expect(sql).toContain('idempotency_key text NOT NULL UNIQUE')
    expect(sql).toContain('promotion_placements')
  })

  it('only produces aggregate performance reports', () => {
    expect(sql).toContain('impressions integer NOT NULL')
    expect(sql).toContain('clicks integer NOT NULL')
    expect(sql).toContain('daily_totals jsonb NOT NULL')
    expect(sql).not.toMatch(/visitor_user_id|visitor_email|search_query|message_body/i)
  })
})
