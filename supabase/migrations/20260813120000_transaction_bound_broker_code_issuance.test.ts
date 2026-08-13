import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260813120000_transaction_bound_broker_code_issuance.sql'), 'utf8')

describe('PHASE 10O-P transaction-bound broker code migration', () => {
  it('makes the transaction link mandatory, unique, and same-attempt constrained', () => {
    expect(source).toContain('ADD COLUMN authorization_transaction_id uuid NULL')
    expect(source).toContain('ALTER COLUMN authorization_transaction_id SET NOT NULL')
    expect(source).toContain('broker_authorization_codes_authorization_transaction_unique UNIQUE (authorization_transaction_id)')
    expect(source).toContain('FOREIGN KEY (authorization_transaction_id,login_attempt_id)')
  })
  it('closes the legacy service bypass and grants only bound issuance', () => {
    expect(source).toContain("REVOKE ALL ON FUNCTION public.create_broker_authorization_code")
    expect(source).toContain('FROM PUBLIC,anon,authenticated,service_role')
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.issue_transaction_bound_broker_authorization_code')
  })
  it('derives bindings from the transaction and atomically scrubs terminal sensitive context', () => {
    expect(source).toContain("tx.client_id,tx.redirect_uri,tx.pkce_s256_challenge")
    expect(source).toContain("SET status='consumed',downstream_nonce=NULL,downstream_state=NULL")
    expect(source).toContain("leg.status<>'verified'")
    expect(source).toContain("attempt.state NOT IN ('auth_principal_bound','existing_primary')")
  })
})
