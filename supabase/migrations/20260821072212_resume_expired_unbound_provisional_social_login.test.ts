import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./20260821072212_resume_expired_unbound_provisional_social_login.sql', import.meta.url), 'utf8')

describe('PHASE 10P expired unbound provisional resume migration', () => {
  it('keeps the orphan predicate exact and preserves forensic rows', () => {
    expect(sql).toContain("source_attempt.state='broker_code_ready'")
    expect(sql).toContain("source_attempt.expires_at<=now_at")
    expect(sql).toContain("source_code.state IN ('ready','expired')")
    expect(sql).toContain("source_code.expires_at<=now_at")
    expect(sql).toContain("source_tx.status='consumed'")
    expect(sql).toContain("source_leg.status='verified'")
    expect(sql).toContain("orphan_account.recovery_email_verified_at IS NOT NULL")
    expect(sql).toContain("matching_auth_identity_count=0")
    expect(sql).not.toMatch(/DELETE\s+FROM\s+private\./i)
  })

  it('terminalizes only the expired source and adopts the exact account', () => {
    expect(sql).toContain("SET state='expired',rejected_at=now_at")
    expect(sql).toContain("SET state='expired',coarse_terminal_reason='expired'")
    expect(sql).toContain("SET state='account_decided',broker_subject=requested_broker_subject")
    expect(sql).toContain("RETURN 'PROVISIONAL_RESUME_READY'")
    expect(sql).toContain("source_attempt_count=1 AND account_attempt_count=1")
  })

  it('preserves service-only authority and canonical lock ordering', () => {
    const brokerLock = sql.indexOf('schoollove:10o-g:broker-decision:v1:')
    const identityLock = sql.indexOf('WHERE broker_subject=requested_broker_subject FOR UPDATE', brokerLock)
    const codeLock = sql.indexOf('WHERE c.login_attempt_id=source_attempt_id FOR UPDATE', identityLock)
    const attemptLock = sql.indexOf('WHERE a.id=source_attempt_id FOR UPDATE', codeLock)
    expect(brokerLock).toBeGreaterThan(0)
    expect(identityLock).toBeGreaterThan(brokerLock)
    expect(codeLock).toBeGreaterThan(identityLock)
    expect(attemptLock).toBeGreaterThan(codeLock)
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) TO service_role')
  })
})
