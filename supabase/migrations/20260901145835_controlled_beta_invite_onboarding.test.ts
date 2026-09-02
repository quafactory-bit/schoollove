import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe,expect,it } from 'vitest'

const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260901145835_controlled_beta_invite_onboarding.sql'),'utf8').replace(/\r\n/g,'\n')
const fn=(name:string)=>{
  const match=sql.match(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))
  if(!match)throw new Error(`missing ${name}`)
  return match[0]
}

describe('invite-bound controlled-beta onboarding migration',()=>{
  it('adds exactly one token-free claim table with both uniqueness boundaries',()=>{
    const table=sql.slice(sql.indexOf('CREATE TABLE public.beta_onboarding_invite_claims'),sql.indexOf('CREATE INDEX beta_onboarding_invite_claims_capacity_idx'))
    expect(sql.match(/^CREATE TABLE /gm)).toHaveLength(1)
    expect(table).toContain('CREATE TABLE public.beta_onboarding_invite_claims')
    expect(table).toContain('UNIQUE (invite_id)')
    expect(table).toContain('UNIQUE (program_id, user_id)')
    expect(table).not.toMatch(/raw_token|token_hash|email|broker_subject/)
  })

  it('models claimed, consumed, expired, and revoked terminal timestamps',()=>{
    expect(sql).toContain("status IN ('claimed', 'consumed', 'expired', 'revoked')")
    expect(sql).toContain("(status = 'consumed') = (consumed_at IS NOT NULL)")
    expect(sql).toContain("(status = 'revoked') = (revoked_at IS NOT NULL)")
  })

  it('forces RLS and prohibits browser table mutation',()=>{
    expect(sql).toContain('ALTER TABLE public.beta_onboarding_invite_claims ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE public.beta_onboarding_invite_claims FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE public.beta_onboarding_invite_claims FROM PUBLIC, anon, authenticated')
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]{0,160}FOR (INSERT|UPDATE|DELETE)/)
  })

  it('recognizes only the exact two-feature People Discovery contract',()=>{
    const body=fn('is_people_discovery_beta_contract')
    expect(body).toContain("ARRAY['people_search','connection_request']::text[]")
    expect(body).toContain('cardinality(snapshot.enabled_features) = 2')
    expect(body).toContain('snapshot.max_users = 20')
    expect(body).toContain("program.ends_at - program.starts_at = interval '14 days'")
    expect(body).toContain('approval_waitlist_enabled IS TRUE')
    expect(body).toContain('count(*) FROM public.beta_program_schools')
    expect(body).toContain(') = 8')
  })

  it('allows exactly four onboarding capabilities and requires closed launch',()=>{
    const body=fn('has_beta_onboarding_access')
    for(const capability of ['adult_eligibility','required_consents','private_profile','school_membership'])expect(body).toContain(capability)
    expect(body).toContain("launch.state = 'closed'")
    expect(body).toContain("claim.status = 'claimed'")
    expect(body).toContain('invite.use_count = 0')
  })

  it('requires one safely bound active or provisional social principal',()=>{
    for(const name of ['has_beta_onboarding_access','claim_beta_invite_for_onboarding']){
      const body=fn(name)
      expect(body).toContain('private.private_accounts')
      expect(body).toContain('private.social_identity_registry')
      expect(body).toContain('auth.identities')
      expect(body).toContain("account.status IN ('provisional','active')")
      expect(body).toContain('identity.status = account.status')
    }
  })

  it('claim locks invite and program while reserving member plus live-claim capacity',()=>{
    const body=fn('claim_beta_invite_for_onboarding')
    expect(body).toMatch(/FROM public\.beta_invites[\s\S]*FOR UPDATE/)
    expect(body).toMatch(/FROM public\.beta_programs[\s\S]*FOR UPDATE/)
    expect(body).toContain("member.status IN ('pending_review','active','suspended')")
    expect(body).toContain("claim.status = 'claimed' AND claim.expires_at > now()")
    expect(body).toContain('member_count + claim_count >= snapshot.max_users')
  })

  it('claim does not redeem, increment use count, or create a member',()=>{
    const body=fn('claim_beta_invite_for_onboarding')
    expect(body).toContain('INSERT INTO public.beta_onboarding_invite_claims')
    expect(body).not.toContain('INSERT INTO public.beta_members')
    expect(body).not.toMatch(/UPDATE public\.beta_invites SET use_count/)
  })

  it('returns a coarse unavailable result for malformed, missing, claimed, or contract-invalid invites',()=>{
    const body=fn('claim_beta_invite_for_onboarding')
    expect(body.match(/RETURN 'UNAVAILABLE'/g)?.length).toBeGreaterThanOrEqual(7)
    expect(body).not.toMatch(/RETURN '(EXPIRED|REVOKED|IDENTITY_MISMATCH|PROGRAM_FULL)'/)
  })

  it('keeps the legacy adult-first redeem function unchanged',()=>{
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.redeem_beta_invite')
    expect(sql).toContain("RETURN 'LEGACY_CONTRACT'")
  })

  it('finalize requires all onboarding records and the exact target school',()=>{
    const body=fn('finalize_beta_onboarding_claim')
    expect(body).toContain('adult_eligibility_records')
    expect(body).toContain("ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']")
    expect(body).toContain('public.private_profiles')
    expect(body).toContain('public.profile_school_memberships')
    expect(body).toContain('membership.school_id = claim.target_school_id')
  })

  it('finalize atomically inserts one pending member, consumes one use, and consumes the claim',()=>{
    const body=fn('finalize_beta_onboarding_claim')
    expect(body).toContain("'pending_review'")
    expect(body).toContain('UPDATE public.beta_invites SET use_count = 1')
    expect(body).toContain("SET status = 'consumed', consumed_at = clock_timestamp()")
    expect(body).toContain('BETA_ONBOARDING_FINALIZE_RACE')
  })

  it('threads the explicit capability into each database write boundary',()=>{
    expect(fn('admin_complete_own_adult_eligibility')).toContain("has_beta_onboarding_access(target_user_id, 'adult_eligibility')")
    expect(fn('record_own_required_consents')).toContain("has_beta_onboarding_access(requester, 'required_consents')")
    expect(fn('upsert_own_private_profile')).toContain("has_beta_onboarding_access(requester, 'private_profile')")
    expect(fn('add_own_school_membership_with_class_history')).toContain("has_beta_onboarding_access(requester, 'school_membership')")
    const insertBoundary=fn('enforce_beta_write_access')
    expect(insertBoundary).toContain("WHEN 'private_profiles' THEN 'private_profile'")
    expect(insertBoundary).toContain("WHEN 'profile_school_memberships' THEN 'school_membership'")
    expect(insertBoundary).toContain('has_beta_onboarding_access(actor, onboarding_capability)')
  })

  it('limits claim membership to its target school and one school',()=>{
    const trigger=fn('enforce_public_or_controlled_beta_school_membership')
    expect(trigger).toContain('NEW.school_id <> claim.target_school_id')
    expect(trigger).toContain('SCHOOL_OUTSIDE_BETA_SCOPE')
    expect(trigger).toContain('SECOND_SCHOOL_NOT_ALLOWED')
    expect(trigger).toContain('FUTURE_GRADUATION_YEAR_NOT_ALLOWED')
  })

  it('keeps grade/class K12 rules and parent ownership in the owner RPC',()=>{
    const body=fn('add_own_school_membership_with_class_history')
    expect(body).toContain("WHEN 'elementary' THEN 6")
    expect(body).toContain("WHEN 'middle' THEN 3")
    expect(body).toContain("WHEN 'high' THEN 3")
    expect(body).toContain('GRADE_CLASS_HISTORY_NOT_ALLOWED_FOR_SCHOOL_TYPE')
    expect(body).toContain('INSERT INTO public.profile_school_class_histories')
    expect(body).toContain('saved.id, requester')
  })

  it('adds People Discovery profile and target membership approval defenses',()=>{
    const body=fn('admin_review_beta_member')
    expect(body).toContain('people_discovery_contract')
    expect(body).toContain('public.is_people_discovery_beta_contract(program.id)')
    expect(body).toContain('PEOPLE_DISCOVERY_ONBOARDING_INCOMPLETE')
    expect(body).toContain('membership.school_id = member.target_school_id')
  })

  it('keeps claimed and pending users outside beta feature access',()=>{
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.has_beta_feature_access')
    expect(fn('finalize_beta_onboarding_claim')).toContain("'pending_review'")
  })

  it('uses fixed search paths and least-privilege execution grants',()=>{
    for(const name of ['is_people_discovery_beta_contract','has_beta_onboarding_access','claim_beta_invite_for_onboarding','finalize_beta_onboarding_claim']){
      expect(fn(name)).toContain("SET search_path = ''")
    }
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.has_beta_onboarding_access(uuid,text)\n  TO authenticated, service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.claim_beta_invite_for_onboarding(uuid,text,text,text)\n  TO service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.finalize_beta_onboarding_claim(uuid)\n  TO service_role')
  })
})
