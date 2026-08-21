import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./20260821025308_recovery_delivery_idempotent_sent_replay.sql', import.meta.url), 'utf8')

describe('PHASE 10P recovery delivery sent-replay idempotency', () => {
  it('recognizes the exact sent tuple before the frozen rate-limit checks', () => {
    const replay = sql.indexOf("RETURN QUERY SELECT 'RECOVERY_DELIVERY_ALREADY_SENT'")
    const rateLimit = sql.indexOf("RETURN QUERY SELECT 'RECOVERY_DELIVERY_LIMITED'")
    expect(replay).toBeGreaterThan(0)
    expect(rateLimit).toBeGreaterThan(replay)
    expect(sql).toContain("v.login_attempt_id=target_attempt_id")
    expect(sql).toContain("v.status='pending'")
    expect(sql).toContain('v.expires_at>issued_at')
    expect(sql).toContain('v.recovery_email_hmac=requested_hmac')
    expect(sql).toContain('v.hmac_key_version=requested_hmac_key_version')
    expect(sql).toContain("d.state='sent'")
  })

  it('preserves all frozen attempt, 60-second, per-attempt, and 24-hour address budgets', () => {
    expect(sql).toContain("attempt.state NOT IN ('upstream_verified','recovery_required','recovery_pending')")
    expect(sql).toContain("latest_reserved_at>issued_at-interval '60 seconds'")
    expect(sql).toContain('attempt_reservation_count>=3')
    expect(sql).toContain('email_reservation_count>=5')
    expect(sql).toContain("reserved_at>issued_at-interval '24 hours'")
  })

  it('keeps the service-only SECURITY DEFINER boundary fail closed', () => {
    expect(sql).toContain("LANGUAGE plpgsql SECURITY DEFINER SET search_path=''" )
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) FROM PUBLIC,anon,authenticated,service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) TO service_role')
  })

  it('is forward-only and does not alter the private schema or frozen tables', () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+(?:TABLE|FUNCTION|INDEX)/i)
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE/i)
  })
})
