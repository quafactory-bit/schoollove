import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath=join(process.cwd(),'supabase/migrations/20260830125907_beta_redeem_optional_identity_binding.sql')
const priorPath=join(process.cwd(),'supabase/migrations/20260730100000_first_controlled_beta_safety_boundaries.sql')
const sql=readFileSync(migrationPath,'utf8').replace(/\r\n/g,'\n')
const priorSql=readFileSync(priorPath,'utf8').replace(/\r\n/g,'\n')

const functionStart='CREATE OR REPLACE FUNCTION public.redeem_beta_invite('
const functionEnd='END; $$;'
function extractRedeemFunction(source:string){
  const start=source.indexOf(functionStart)
  const end=source.indexOf(functionEnd,start)
  if(start<0||end<0) throw new Error('redeem_beta_invite definition missing')
  return source.slice(start,end+functionEnd.length)
}

describe('beta redeem optional identity binding migration',()=>{
  it('accepts only null or lowercase SHA-256 actor identity hashes while keeping the token hash mandatory',()=>{
    expect(sql).toContain("requested_token_hash IS NULL OR requested_token_hash !~ '^[0-9a-f]{64}$'")
    expect(sql).toContain("actor_email_hash IS NOT NULL AND actor_email_hash !~ '^[0-9a-f]{64}$'")
    expect(sql).toContain("actor_domain_hash IS NOT NULL AND actor_domain_hash !~ '^[0-9a-f]{64}$'")
    expect(sql).not.toContain("OR actor_email_hash !~ '^[0-9a-f]{64}$'")
    expect(sql).not.toContain("OR actor_domain_hash !~ '^[0-9a-f]{64}$'")
  })

  it('allows unrestricted null-hash redemption and fails closed for missing or mismatched restricted hashes',()=>{
    expect(sql).toContain('invite.email_hash IS NOT NULL\n    AND (actor_email_hash IS NULL OR invite.email_hash<>actor_email_hash)')
    expect(sql).toContain('invite.domain_hash IS NOT NULL\n    AND (actor_domain_hash IS NULL OR invite.domain_hash<>actor_domain_hash)')
  })

  it('preserves authenticated actor authority and service-role-only execution',()=>{
    expect(sql).toContain("auth.uid()=actor_user_id OR auth.role()='service_role' OR session_user='postgres'")
    expect(sql).toContain("THEN RETURN 'ACCESS_DENIED'")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.redeem_beta_invite(uuid,text,text,text) FROM PUBLIC,anon,authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.redeem_beta_invite(uuid,text,text,text) TO service_role')
  })

  it('preserves consent, lifecycle, program, school, capacity, one-use, membership, and audit gates',()=>{
    for(const contract of [
      'public.adult_eligibility_records',
      'public.consent_records',
      "invite.revoked_at IS NOT NULL OR invite.expires_at<=now() OR invite.max_uses<>1 OR invite.use_count>=1",
      "status='active'",
      'emergency_disabled_at IS NULL',
      'public.beta_program_setup_snapshots',
      'public.beta_program_schools',
      'snapshot.approval_waitlist_enabled IS DISTINCT FROM true',
      'reserved_count>=snapshot.max_users',
      "THEN RETURN 'ALREADY_REDEEMED'",
      'UPDATE public.beta_invites SET use_count=use_count+1',
      "'invite_redeemed'",
    ]) expect(sql).toContain(contract)
  })

  it('changes only the three approved identity-validation boundaries in the prior function body',()=>{
    const priorFunction=extractRedeemFunction(priorSql)
    const expected=priorFunction
      .replace(
        "IF requested_token_hash !~ '^[0-9a-f]{64}$' OR actor_email_hash !~ '^[0-9a-f]{64}$'\n    OR actor_domain_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'INVALID'; END IF;",
        ()=>"IF requested_token_hash IS NULL OR requested_token_hash !~ '^[0-9a-f]{64}$'\n    OR (actor_email_hash IS NOT NULL AND actor_email_hash !~ '^[0-9a-f]{64}$')\n    OR (actor_domain_hash IS NOT NULL AND actor_domain_hash !~ '^[0-9a-f]{64}$')\n    THEN RETURN 'INVALID'; END IF;",
      )
      .replace(
        "IF invite.email_hash IS NOT NULL AND invite.email_hash<>actor_email_hash THEN RETURN 'IDENTITY_MISMATCH'; END IF;",
        ()=>"IF invite.email_hash IS NOT NULL\n    AND (actor_email_hash IS NULL OR invite.email_hash<>actor_email_hash) THEN RETURN 'IDENTITY_MISMATCH'; END IF;",
      )
      .replace(
        "IF invite.domain_hash IS NOT NULL AND invite.domain_hash<>actor_domain_hash THEN RETURN 'IDENTITY_MISMATCH'; END IF;",
        ()=>"IF invite.domain_hash IS NOT NULL\n    AND (actor_domain_hash IS NULL OR invite.domain_hash<>actor_domain_hash) THEN RETURN 'IDENTITY_MISMATCH'; END IF;",
      )
    expect(extractRedeemFunction(sql)).toBe(expected)
  })

  it('does not add schema objects or mutate existing beta data',()=>{
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE)\s+(TABLE|TYPE|POLICY|TRIGGER|INDEX)\b/i)
    const outsideFunction=sql.replace(extractRedeemFunction(sql),'')
    expect(outsideFunction).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO|FROM)?\s*public\.beta_/i)
  })
})
