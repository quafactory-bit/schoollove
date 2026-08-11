import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260811110000_recovery_delivery_state_boundary.sql'), 'utf8')

describe('PHASE 10O-I recovery delivery boundary contract', () => {
  it('freezes the ledger and all budget states without raw destination or OTP columns', () => {
    expect(sql).toContain('CREATE TABLE private.recovery_delivery_attempts')
    expect(sql).toContain("state IN ('reserved','sent','failed')")
    expect(sql).toContain("ALTER TABLE private.recovery_delivery_attempts ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE private.recovery_delivery_attempts FORCE ROW LEVEL SECURITY")
    const tableSql = sql.slice(sql.indexOf('CREATE TABLE private.recovery_delivery_attempts'), sql.indexOf('ALTER TABLE private.recovery_delivery_attempts ENABLE'))
    expect(tableSql).not.toMatch(/\b(canonical_email|destination_email|otp|provider_response|message_body)\b/i)
  })
  it('checks limits before superseding a usable challenge and counts failed reservations', () => {
    const guard = sql.indexOf("IF (latest_reserved_at IS NOT NULL")
    const supersede = sql.indexOf("UPDATE private.recovery_email_verifications SET status='revoked'")
    expect(guard).toBeGreaterThan(-1); expect(supersede).toBeGreaterThan(guard)
    expect(sql).toContain("interval '60 seconds'")
    expect(sql).toContain('attempt_reservation_count>=3')
    expect(sql).toContain("reserved_at>issued_at-interval '24 hours'")
    expect(sql).toContain('email_reservation_count>=5')
    expect(sql).toContain("RETURN QUERY SELECT 'RECOVERY_DELIVERY_LIMITED'")
  })
  it('retires standalone creation and permits service-only reserve/sent/fail RPCs', () => {
    const old = 'public.create_login_attempt_recovery_verification(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)'
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${old}`)
    for (const signature of [
      'public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)',
      'public.mark_login_attempt_recovery_delivery_sent(uuid)',
      'public.fail_login_attempt_recovery_delivery(uuid)',
    ]) { expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature}`); expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`) }
  })
  it('requires an exact sent delivery row before OTP consumption and clears failed crypto', () => {
    expect(sql).toContain("delivery.state<>'sent'")
    expect(sql).toContain("UPDATE private.recovery_delivery_attempts SET state='failed'")
    expect(sql).toContain("UPDATE private.recovery_email_verifications SET status='revoked'")
    expect(sql).toContain('RECOVERY_DELIVERY_CONFIRMATION_REJECTED')
  })
})
