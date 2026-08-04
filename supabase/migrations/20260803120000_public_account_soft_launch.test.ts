import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe,expect,it} from 'vitest'

const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260803120000_public_account_soft_launch.sql'),'utf8')

describe('PHASE 10N-B hardened public account migration',()=>{
  it('wraps the entire migration and freezes the 68 to 71 table contract before DDL',()=>{
    expect(sql.trimStart().indexOf('BEGIN;')).toBeLessThan(sql.indexOf('CREATE TABLE public.public_account_launch_control'))
    expect(sql).toContain('(SELECT count(*) FROM phase10n_table_contract)<>68')
    expect(sql).toContain('(SELECT count(*) FROM phase10n_table_contract)<>71')
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
  it('fails closed on audited Production baseline or UUID person-link drift',()=>{
    for(const code of ['PHASE10N_PUBLIC_TABLE_CONTRACT_MISMATCH','PHASE10N_PERSON_LINK_CONTRACT_MISMATCH','PHASE10N_PRODUCTION_BASELINE_MISMATCH'])expect(sql).toContain(code)
    for(const expected of ['legacy_count<>0','school_count<>10006','school_drift<>0','person_count<>0','editorial_count<>0','beta_ops<>0','beta_program_count<>1','global_flags<>8','scoped_flags<>0','commercial_count<>0'])expect(sql).toContain(expected)
  })
  it('starts closed and generic state mutation cannot select ready or open',()=>{
    expect(sql).toContain("'public_account','closed',false,false,false")
    expect(sql).toContain("requested_state NOT IN ('closed','internal_test','emergency_stopped')")
    expect(sql).toContain('admin_record_public_account_readiness')
    expect(sql).toContain('admin_open_public_account_launch')
    expect(sql).toContain('FRESH_AFFIRMATIVE_READINESS_REQUIRED')
  })
  it('removes every direct authenticated account mutation and free-text deletion RPC',()=>{
    expect(sql).toContain('REVOKE INSERT ON public.consent_records,public.account_deletion_requests FROM authenticated')
    expect(sql).toContain('REVOKE INSERT,UPDATE,DELETE ON public.private_profiles,public.profile_school_memberships FROM authenticated')
    expect(sql).toContain('DROP FUNCTION public.request_own_account_deletion(text)')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.request_own_account_deletion()')
    expect(sql).not.toContain('CREATE POLICY private_profiles_owner_insert')
    expect(sql).not.toContain('CREATE POLICY memberships_owner_insert')
  })
  it('uses owner-only RPCs that derive auth uid and force protected profile columns',()=>{
    for(const fn of ['record_own_required_consents','upsert_own_private_profile','delete_own_private_profile','add_own_school_membership','delete_own_school_membership'])expect(sql).toContain(`FUNCTION public.${fn}`)
    expect(sql).toContain('DECLARE requester uuid:=auth.uid()')
    expect(sql).toMatch(/profile_photo_url,introduction,profile_visibility,status\)\s*VALUES\(requester,normalized_name,normalized_instagram,NULL,normalized_intro,'private','active'\)/)
    expect(sql).toContain('normalize(requested_display_name,NFKC)')
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock')
  })
  it('separates request-count activities from first-account milestones',()=>{
    expect(sql).toContain("event_kind text NOT NULL CHECK (event_kind IN ('activity','milestone'))")
    expect(sql).toContain('record_public_account_activity')
    expect(sql).toContain('record_own_otp_verified_milestone')
    expect(sql).toContain('private_profile_first_created_at')
    expect(sql).toContain('school_membership_first_created_at')
    expect(sql).not.toContain("'return_session'")
    expect(sql).not.toContain("'private_profile_saved'")
  })
  it('keeps controlled-beta one-school enforcement and public maximum three',()=>{
    expect(sql).toContain('active_beta_count > 0')
    expect(sql).toContain("RAISE EXCEPTION 'SECOND_SCHOOL_NOT_ALLOWED'")
    expect(sql).toContain('existing_count>=3')
    expect(sql).toContain("RAISE EXCEPTION 'PUBLIC_ACCOUNT_SCHOOL_LIMIT_REACHED'")
    expect(sql).toContain("control.control_key = 'public_account' AND control.state = 'emergency_stopped'")
  })
  it('uses two-phase actual Auth deletion and never records completion while identity is linked',()=>{
    expect(sql).toContain('admin_prepare_public_account_deletion')
    expect(sql).toContain("status='public_data_deleted'")
    expect(sql).toContain('admin_begin_public_account_auth_deletion')
    expect(sql).toContain("status='auth_deletion_pending'")
    expect(sql).toContain('admin_mark_public_account_auth_deletion_failed')
    expect(sql).toContain("status='failed_safe'")
    expect(sql).toContain('admin_finalize_public_account_auth_deletion')
    expect(sql).toContain("status='auth_deletion_pending' AND user_id IS NULL")
    expect(sql).toContain("purge_after=clock_timestamp()+interval '90 days'")
    expect(sql).not.toContain('retained_for_legal_audit')
  })
  it('forces RLS and keeps administrative functions service-only',()=>{
    for(const table of ['public_account_launch_control','public_account_launch_audit','public_account_daily_funnel'])expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
    for(const fn of ['admin_set_public_account_launch_state','admin_record_public_account_readiness','admin_open_public_account_launch','admin_prepare_public_account_deletion','admin_begin_public_account_auth_deletion'])expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}`)
  })
})
