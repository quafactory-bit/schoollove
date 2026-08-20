import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./20260820091834_expire_stale_social_identity_attempts.sql', import.meta.url), 'utf8')

describe('PHASE 10P stale social identity attempt expiry boundary', () => {
  it('terminalizes stale live-subject ownership before installing a replacement', () => {
    const expireCall = sql.indexOf('private.expire_stale_social_identity_attempt(stale_competing,now_at)')
    const currentBrokerLock = sql.indexOf("schoollove:10o-g:broker-decision:v1:'||requested_provider")
    expect(expireCall).toBeGreaterThan(0)
    expect(currentBrokerLock).toBeGreaterThan(expireCall)
    expect(sql).toContain("expires_at<=now_at")
    expect(sql).toContain("expires_at>now_at")
    expect(sql).toContain("state='expired',coarse_terminal_reason='expired'")
  })

  it('preserves recovery-before-broker locking and terminal secret scrubbing', () => {
    const helperStart = sql.indexOf('CREATE FUNCTION private.expire_stale_social_identity_attempt')
    const helperEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.record_verified_social_identity_from_upstream_leg')
    const helper = sql.slice(helperStart, helperEnd)
    expect(helper.indexOf('schoollove:10o-g:recovery-decision:v1:')).toBeLessThan(helper.indexOf('schoollove:10o-g:broker-decision:v1:'))
    expect(helper).toContain("SET status='expired'")
    expect(helper).toContain("delivery.state='reserved'")
    expect(helper).toContain("SET state='failed',failed_at=at_time")
    expect(helper).not.toMatch(/DELETE\s+FROM/i)
  })

  it('scrubs live downstream context without rewriting terminal transactions', () => {
    expect(sql).toContain("status IN ('pending','claimed','upstream_bound')")
    expect(sql).toContain("broker_handle_digest=NULL,downstream_nonce=NULL,downstream_state=NULL")
    expect(sql).toContain('terminal_at=at_time,version=version+1')
  })

  it('keeps the partial unique index and private helper permissions fail closed', () => {
    expect(sql).toContain("to_regclass('private.oauth_login_attempts_live_subject_unique')")
    expect(sql).not.toMatch(/DROP\s+INDEX[^;]*oauth_login_attempts_live_subject_unique/i)
    expect(sql).toContain('REVOKE ALL ON FUNCTION private.expire_stale_social_identity_attempt(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) TO service_role')
  })

  it('performs a one-time cleanup through the same audited helper', () => {
    expect(sql).toContain('FOR stale_attempt_id IN')
    expect(sql).toContain('private.expire_stale_social_identity_attempt(stale_attempt_id,clock_timestamp())')
    expect(sql).toContain('PHASE10P_STALE_IDENTITY_ONE_TIME_EXPIRY_FAILED')
  })
})
