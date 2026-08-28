import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./20260829110000_google_callback_durable_diagnostic_persistence.sql', import.meta.url),
  'utf8',
)

const reasons = [
  'pkce_resume_failed',
  'token_exchange_transport_failed',
  'token_exchange_http_failed',
  'token_response_malformed',
  'id_token_missing_or_malformed',
  'jwks_fetch_failed',
  'jwks_key_rejected',
  'id_token_signature_failed',
  'issuer_or_audience_failed',
  'token_time_failed',
  'nonce_failed',
  'provider_identity_malformed',
  'verifier_unclassified_failure',
] as const

describe('Google callback durable diagnostic migration contract', () => {
  it('adds only the private leg diagnostic fields with the exact allowlist', () => {
    expect(sql).toContain('ALTER TABLE private.upstream_login_legs')
    expect(sql).toContain('ADD COLUMN diagnostic_reason text NULL')
    expect(sql).toContain('ADD COLUMN diagnostic_upstream_status integer NULL')
    const allowlist = sql.match(/diagnostic_reason IS NULL OR diagnostic_reason IN \(([\s\S]*?)\n\s*\),/)?.[1]
    expect(allowlist).toBeDefined()
    expect([...allowlist!.matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual(reasons)
    for (const reason of reasons) expect(sql).toContain(`'${reason}'`)
    expect(sql).toContain('diagnostic_upstream_status BETWEEN 100 AND 599')
    expect(sql).toContain("provider='google'")
    expect(sql).toContain("status IN ('rejected','expired')")
    expect(sql).toContain('terminal_at IS NOT NULL')
    expect(sql).toContain('CREATE TRIGGER upstream_login_legs_diagnostic_immutability')
    expect(sql).toContain('UPSTREAM_LOGIN_LEG_DIAGNOSTIC_IMMUTABLE')
    expect(sql).toContain('UPSTREAM_LOGIN_LEG_DIAGNOSTIC_TRANSITION_REJECTED')
    expect(sql).not.toContain('coarse_terminal_reason=requested_diagnostic_reason')
  })

  it('keeps legacy failure compatibility and adds one atomic service-only RPC', () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.fail_upstream_login_leg\s*\(/)
    expect(sql).toContain('CREATE FUNCTION public.fail_upstream_login_leg_with_diagnostic(')
    expect(sql).toMatch(/SECURITY DEFINER\r?\nSET search_path=''/)
    expect(sql).toContain('PERFORM private.require_social_attempt_service();')
    expect(sql).toContain('PERFORM private.lock_downstream_authorization_transaction_for_attempt(target_attempt_id);')
    expect(sql).toContain('private.terminalize_bound_downstream_authorization_transaction(')
    expect(sql).toContain('diagnostic_reason=requested_diagnostic_reason')
    expect(sql).toContain('diagnostic_upstream_status=requested_diagnostic_upstream_status')
    expect(sql).toContain('OR requested_diagnostic_reason IS NULL')
    expect(sql).toContain('IF reason IS NULL')
    expect(sql).toContain("WHEN reason='expired' OR requested_diagnostic_reason='token_time_failed'")
    expect(sql).toContain("state=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fail_upstream_login_leg_with_diagnostic(uuid,uuid,text,text,integer)')
    expect(sql).toContain('FROM PUBLIC,anon,authenticated;')
    expect(sql).toContain('TO service_role;')
  })

  it('never introduces sensitive diagnostic columns or payload persistence', () => {
    for (const forbidden of [
      'authorization_code', 'access_token', 'refresh_token', 'id_token', 'jwt_payload',
      'response_body', 'request_headers', 'response_headers', 'diagnostic_email',
      'diagnostic_subject', 'diagnostic_nonce', 'diagnostic_state', 'diagnostic_verifier',
    ]) {
      expect(sql).not.toMatch(new RegExp(`ADD COLUMN\\s+${forbidden}\\b`, 'i'))
      expect(sql).not.toMatch(new RegExp(`SET\\s+${forbidden}\\s*=`, 'i'))
    }
  })
})
