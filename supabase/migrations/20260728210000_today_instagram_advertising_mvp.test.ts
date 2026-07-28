import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./20260728210000_today_instagram_advertising_mvp.sql', import.meta.url), 'utf8')
const tables = [
  'promotion_accounts', 'promotion_account_verifications', 'promotion_requests', 'promotion_assets',
  'promotion_reviews', 'promotion_orders', 'promotion_placements', 'promotion_impressions',
  'promotion_clicks', 'promotion_reports', 'promotion_audit_logs', 'editorial_features',
]

describe('PHASE 10D promotion migration', () => {
  it('keeps editorial discovery and paid sponsorship structurally separate', () => {
    expect(sql).toContain("promotion_type text NOT NULL DEFAULT 'sponsored'")
    expect(sql).toContain('CREATE TABLE public.editorial_features')
    expect(sql).toContain('economic_consideration boolean NOT NULL DEFAULT false CHECK (economic_consideration=false)')
  })

  it('forces RLS and removes public, anon, and authenticated table access', () => {
    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`)
    }
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC,anon,authenticated;/)
    expect(sql).toMatch(/GRANT ALL ON TABLE[\s\S]+TO service_role;/)
  })

  it('uses service-only RPCs with fixed search paths', () => {
    expect((sql.match(/SECURITY DEFINER/g) ?? []).length).toBeGreaterThanOrEqual(13)
    expect((sql.match(/SET search_path = ''/g) ?? []).length).toBeGreaterThanOrEqual(15)
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]+ TO (?:PUBLIC|anon|authenticated)/)
    expect(sql).toContain('TO service_role;')
  })

  it('keeps verification codes and metric identities pseudonymous', () => {
    expect(sql).toContain("code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$')")
    expect(sql).toContain("session_hash text NOT NULL CHECK (session_hash ~ '^[0-9a-f]{64}$')")
    expect(sql).not.toMatch(/\bip_address\b|\braw_ip\b|\buser_agent\b/i)
    expect(sql).toContain("expires_at timestamptz NOT NULL DEFAULT (now() + interval '32 days')")
  })

  it('restricts creative images to a server-proxied host allowlist', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.promotion_image_url_is_safe')
    expect(sql).toContain('images\\.unsplash\\.com|images\\.pexels\\.com|i\\.imgur\\.com')
    expect(sql).toContain('CHECK (public.promotion_image_url_is_safe(image_url))')
  })

  it('requires manual payment confirmation before a unique KST slot can be scheduled', () => {
    expect(sql).toContain("payment_method text NOT NULL DEFAULT 'bank_transfer'")
    expect(sql).toContain("req.status<>'payment_confirmed'")
    expect(sql).toContain("AT TIME ZONE 'Asia/Seoul'")
    expect(sql).toContain('promotion_placements_slot_conflict')
  })

  it('supports emergency pause, applicant revision, and pre-payment cancellation', () => {
    expect(sql).toContain("report_reason IN ('impersonation','privacy','illegal','minor_risk')")
    expect(sql).toContain("SET status='paused'")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.revise_own_promotion_request')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.cancel_own_promotion_request')
    expect(sql).toContain('reporter_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE')
  })
})
