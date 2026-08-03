import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe,expect,it} from 'vitest'

const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260803120000_public_account_soft_launch.sql'),'utf8')

describe('PHASE 10N-A public account migration',()=>{
  it('starts closed with exact three-feature contracts',()=>{
    expect(sql).toContain("'public_account','closed',false,false,false")
    for(const feature of ['account_registration','private_profile','school_membership'])expect(sql).toContain(feature)
  })
  it('forces RLS and gives no direct anon/authenticated table mutation',()=>{
    for(const table of ['public_account_launch_control','public_account_launch_audit','public_account_daily_funnel'])expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
    expect(sql).toContain('FROM PUBLIC,anon,authenticated')
    expect(sql).toContain('TO service_role')
  })
  it('uses fixed search paths and service-only mutations',()=>{
    for(const fn of ['admin_set_public_account_launch_state','record_public_account_event','get_public_account_funnel','admin_complete_public_account_deletion']){
      expect(sql).toContain(`FUNCTION public.${fn}`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}`)
    }
    expect(sql.match(/SET search_path = ''/g)?.length).toBeGreaterThanOrEqual(8)
  })
  it('keeps controlled-beta one-school enforcement while allowing public maximum three',()=>{
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.enforce_beta_write_access()')
    expect(sql).toContain("WHEN 'profile_school_memberships' THEN 'school_membership'")
    expect(sql).toContain('active_beta_count > 0')
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock')
    expect(sql).toContain("RAISE EXCEPTION 'SECOND_SCHOOL_NOT_ALLOWED'")
    expect(sql).toContain('existing_count>=3')
    expect(sql).toContain("RAISE EXCEPTION 'PUBLIC_ACCOUNT_SCHOOL_LIMIT_REACHED'")
  })
  it('makes deletion atomic and stores no request reason or personal audit metadata',()=>{
    const requestFunction=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.request_own_account_deletion'),sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_complete_public_account_deletion'))
    expect(requestFunction.indexOf("UPDATE public.private_profiles SET status='deletion_requested'")).toBeLessThan(requestFunction.indexOf('INSERT INTO public.account_deletion_requests'))
    expect(sql).toContain('DELETE FROM public.private_profiles WHERE owner_user_id=request.user_id')
    expect(sql).toContain("UPDATE auth.users SET banned_until='9999-12-31 23:59:59+00'::timestamptz")
    expect(sql).toContain("SET status='done',reason=NULL")
    expect(sql).toContain("'retained_blocked_tombstone_until_9999'")
    expect(sql).not.toContain("jsonb_build_object('user_id'")
  })
})
