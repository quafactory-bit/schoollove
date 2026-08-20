import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./20260819120000_first_social_login_post_oidc_binding.sql', import.meta.url), 'utf8')

describe('PHASE 10P first social login DB boundary', () => {
  it('allows issuance only from recovery-decided or previously approved account states', () => {
    expect(sql).toContain("attempt.state NOT IN ('account_decided','auth_principal_bound','existing_primary')")
    expect(sql).toContain("attempt.state='account_decided' AND a.status='provisional' AND a.auth_user_id IS NULL")
    expect(sql).toContain('requested_downstream_nonce text DEFAULT NULL')
    expect(sql).toContain("state='broker_code_ready'")
  })

  it('binds from a consumed trusted attempt and the exact Supabase OIDC subject', () => {
    expect(sql).toContain("attempt.state<>'consumed'")
    expect(sql).toContain("i.provider='schoollove-'||attempt.provider")
    expect(sql).toContain('i.provider_id=attempt.broker_subject')
    expect(sql).toContain("i.identity_data->>'sub'=attempt.broker_subject")
    expect(sql).toContain("AUTH_PRINCIPAL_ALREADY_BOUND")
    expect(sql).not.toMatch(/GRANT EXECUTE[^;]+ TO (?:PUBLIC|anon|authenticated)/)
  })

  it('exposes only service-role recovery and binding RPCs without adding a private table', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_social_recovery_http_context(uuid) TO service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.bind_social_auth_principal_from_attempt(uuid,uuid) TO service_role')
    expect(sql).not.toMatch(/CREATE TABLE/i)
  })
})
