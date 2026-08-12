import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260812160000_upstream_login_leg_boundary.sql'), 'utf8')

describe('PHASE 10O-M durable upstream leg migration contract', () => {
  it('adds only the forward durable leg boundary and closes the old bypass', () => {
    expect(migration).toContain('CREATE TABLE private.upstream_login_legs')
    expect(migration).toContain("'upstream_pending'")
    expect(migration).toContain('oauth_login_attempts_upstream_pending_identity_clear')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.record_verified_social_identity')
    expect(migration).toContain('record_verified_social_identity_from_upstream_leg')
    expect(migration).not.toMatch(/\b(raw_state|raw_nonce|pkce_verifier|authorization_code|access_token|refresh_token|id_token|email|subject|profile)\s+(text|bytea)/)
    expect('PHASE10O_M_DURABLE_LEG_SCHEMA_OK').toBeTruthy()
  })

  it('makes claim failure terminalize and scrubs every C-leg secret column', () => {
    expect(migration).toContain("status='callback_claimed',state_digest=NULL")
    expect(migration).toContain("state='failed_safe'")
    expect(migration).toContain("PERFORM private.scrub_upstream_login_leg")
    expect(migration).toContain("'REPLAY_REJECTED'")
    expect(migration).toContain('pkce_verifier_ciphertext=NULL')
    expect(migration).toContain('PHASE10O_M_OBJECT_COLLISION')
    expect(migration).toContain('GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME')
    expect(migration).toContain("violation_constraint<>'oauth_login_attempts_live_subject_unique'")
  })
})
