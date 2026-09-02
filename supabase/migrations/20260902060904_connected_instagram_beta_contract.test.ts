import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260902060904_connected_instagram_beta_contract.sql'),'utf8').replace(/\r\n/g,'\n')
const functionBody=(name:string)=>{
  const marker=`CREATE OR REPLACE FUNCTION ${name}`
  const start=sql.indexOf(marker)
  const next=sql.indexOf('\nCREATE OR REPLACE FUNCTION ',start+marker.length)
  if(start<0)throw new Error(`${name} missing`)
  return sql.slice(start,next<0?sql.length:next)
}

describe('Connected Instagram controlled-beta contract migration',()=>{
  it('adds no table or column and preserves one forward transaction',()=>{
    expect(sql).not.toMatch(/\bCREATE TABLE\b/i)
    expect(sql).not.toMatch(/\bALTER TABLE\b/i)
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1)
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1)
  })

  it('recognizes exactly three canonical feature sets',()=>{
    const classifier=functionBody('private.controlled_beta_contract_kind')
    expect(classifier).toContain("ARRAY['account_registration','private_profile']")
    expect(classifier).toContain("ARRAY['people_search','connection_request']")
    expect(classifier).toContain("ARRAY['instagram_permission']")
    expect(classifier).toContain("cardinality(requested_features) = 1")
    expect(classifier).toContain("'CONNECTED_INSTAGRAM_BETA'")
    expect(classifier).not.toContain("ARRAY['people_search','connection_request','instagram_permission']")
  })

  it('fixes Instagram capacity at three while preserving existing capacities',()=>{
    const maxUsers=functionBody('private.controlled_beta_contract_max_users')
    expect(maxUsers).toContain("WHEN 'ACCOUNT_PRIVATE_BETA' THEN 20")
    expect(maxUsers).toContain("WHEN 'PEOPLE_DISCOVERY_BETA' THEN 20")
    expect(maxUsers).toContain("WHEN 'CONNECTED_INSTAGRAM_BETA' THEN 3")
  })

  it('requires the complete connected-user admission envelope',()=>{
    const prerequisites=functionBody('private.has_connected_instagram_beta_prerequisites')
    for(const marker of ['adult_eligibility_records','consent_records','private_profiles','profile_school_memberships','is_people_discovery_beta_contract','connections'])expect(prerequisites).toContain(marker)
    expect(prerequisites).toContain("member.status = 'active'")
    expect(prerequisites).toContain("connection.status = 'active'")
    expect(prerequisites).toContain('connection.disconnected_at IS NULL')
  })

  it('uses legacy redeem without creating an onboarding claim',()=>{
    const redeem=functionBody('public.redeem_beta_invite')
    expect(redeem).toContain("contract_kind='CONNECTED_INSTAGRAM_BETA'")
    expect(redeem).toContain('CONNECTED_INSTAGRAM_PREREQUISITES_REQUIRED')
    expect(redeem).not.toContain('beta_onboarding_invite_claims')
  })

  it('revalidates connected prerequisites at approval',()=>{
    const review=functionBody('public.admin_review_beta_member')
    expect(review).toContain("ELSIF contract_kind='CONNECTED_INSTAGRAM_BETA'")
    expect(review).toContain('CONNECTED_INSTAGRAM_APPROVAL_PREREQUISITES_REQUIRED')
    expect(review).toContain("flag.feature_key='instagram_permission'")
  })

  it('keeps feature access snapshot and program scoped',()=>{
    const access=functionBody('public.has_beta_feature_access')
    expect(access).toContain('requested_feature=ANY(snapshot.enabled_features)')
    expect(access).toContain('private.controlled_beta_contract_kind(snapshot.enabled_features)')
    expect(access).toContain('program_flag.program_id=program.id')
    expect(access).toContain('global_stop.enabled=false')
    expect(access).toContain("requested_feature='connection_request'")
  })

  it('keeps privileged functions fail-closed',()=>{
    for(const signature of [
      'public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text)',
      'public.admin_activate_beta_setup(uuid,text)',
      'public.admin_configure_controlled_beta_features(uuid,text[],text)',
      'public.admin_start_controlled_beta_program(uuid,text,text)',
      'public.admin_reactivate_controlled_beta_program(uuid,text,text,text)',
      'public.admin_issue_beta_invite(uuid,text,text,text,integer,timestamptz,text)',
      'public.redeem_beta_invite(uuid,text,text,text)',
      'public.admin_review_beta_member(uuid,text,text,text)',
    ]){
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,anon,authenticated;`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`)
    }
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.has_beta_feature_access(uuid,text) TO authenticated,service_role;')
  })
})
