import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260811090000_social_recovery_crypto_id_binding.sql'), 'utf8')

describe('PHASE 10O-H preallocated recovery crypto-ID migration contract', () => {
  it('is forward-only and requires exact server-supplied UUIDs', () => {
    expect(sql).toContain('ADD COLUMN reserved_account_id uuid NULL')
    expect(sql).toContain('requested_verification_id uuid')
    expect(sql).toContain('requested_reserved_account_id uuid')
    expect(sql).toContain("id,login_attempt_id,purpose,reserved_account_id")
    expect(sql).toContain('RETURN requested_verification_id')
    expect(sql).toContain('SOCIAL_ATTEMPT_RECOVERY_ID_RESERVATION_REJECTED')
    expect(sql).toContain('recovery_email_verifications_pending_reserved_account_unique')
    expect(sql).not.toContain('CREATE EXTENSION')
  })

  it('clears all terminal one-time material including the reservation', () => {
    const triggerStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.clear_terminal_recovery_challenge_material')
    const triggerEnd = sql.indexOf('-- The old DB-generated-ID boundary')
    const triggerSql = sql.slice(triggerStart, triggerEnd)
    expect(triggerSql).toContain("NEW.status IN ('consumed','locked','expired','revoked')")
    expect(triggerSql).toContain('NEW.reserved_account_id:=NULL')
  })

  it('retires the DB-generated challenge signature and grants only the new service boundary', () => {
    const oldSignature = 'public.create_login_attempt_recovery_verification(uuid,bytea,integer,bytea,bytea,integer,bytea,integer)'
    const newSignature = 'public.create_login_attempt_recovery_verification(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)'
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${oldSignature}`)
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${newSignature}`)
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${newSignature} TO service_role`)
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role')
  })

  it('creates a NEW account with exactly the reservation after recovery matching', () => {
    expect(sql).toContain('INSERT INTO private.private_accounts(id,status,primary_provider')
    expect(sql).toContain('VALUES(verification.reserved_account_id')
    expect(sql).toContain('SOCIAL_ATTEMPT_RESERVED_ACCOUNT_COLLISION')
    expect(sql).toContain('SOCIAL_ATTEMPT_RESERVED_ACCOUNT_MISMATCH')
    expect(sql.indexOf('IF matched.id IS NOT NULL THEN')).toBeLessThan(sql.indexOf('INSERT INTO private.private_accounts(id,status,primary_provider'))
  })
})
