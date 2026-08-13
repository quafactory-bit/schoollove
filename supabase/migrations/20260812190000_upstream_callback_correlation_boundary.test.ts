import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260812190000_upstream_callback_correlation_boundary.sql'), 'utf8')

describe('PHASE 10O-N opaque upstream callback correlation migration', () => {
  it('uses a pending digest-only unique key and a state-only service RPC', () => {
    expect(migration).toContain('upstream_login_legs_pending_state_digest_unique')
    expect(migration).toContain("WHERE status='pending' AND state_digest IS NOT NULL")
    expect(migration).toContain('claim_upstream_login_callback_by_state(text,bytea,bytea)')
    expect(migration).toContain('SELECT * INTO attempt FROM private.oauth_login_attempts')
    expect(migration).toContain('SELECT * INTO leg FROM private.upstream_login_legs')
    expect(migration).toContain("'CORRELATION_REJECTED'")
    expect(migration).toContain("'CALLBACK_CLAIMED'")
  })

  it('closes the by-ID service bypass and distinguishes the audited state collision', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea) FROM PUBLIC,anon,authenticated,service_role')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.claim_upstream_login_callback_by_state(text,bytea,bytea) TO service_role')
    expect(migration).toContain("violation_constraint='upstream_login_legs_pending_state_digest_unique'")
    expect(migration).toContain("'UPSTREAM_LOGIN_LEG_STATE_COLLISION'")
  })
})
