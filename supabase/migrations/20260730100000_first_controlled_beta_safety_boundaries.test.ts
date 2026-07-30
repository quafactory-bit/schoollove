import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe,expect,it } from 'vitest'

const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260730100000_first_controlled_beta_safety_boundaries.sql'),'utf8')

describe('PHASE 10J-B migration structure',()=>{
  it('adds selected-school contracts without editing the PHASE 10I migration',()=>{
    expect(sql).toContain('ADD COLUMN target_school_id uuid REFERENCES public.schools(id) ON DELETE RESTRICT')
    expect(sql).toContain('CREATE TABLE public.beta_program_schools')
    expect(sql).toContain('beta_program_schools_snapshot_program_fk')
    expect(sql).toContain('PROGRAM_SCHOOL_IMMUTABLE')
  })

  it('forces RLS and direct-access revocation on the allowlist',()=>{
    expect(sql).toContain('ALTER TABLE public.beta_program_schools ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE public.beta_program_schools FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE public.beta_program_schools FROM PUBLIC,anon,authenticated')
    expect(sql).toContain('GRANT ALL ON TABLE public.beta_program_schools TO service_role')
  })

  it('creates service-only start and reactivation functions with fixed search paths',()=>{
    for(const name of ['admin_start_controlled_beta_program','admin_reactivate_controlled_beta_program','admin_configure_controlled_beta_features']){
      expect(sql).toContain(`FUNCTION public.${name}`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}`)
    }
    expect(sql).toContain("SECURITY DEFINER SET search_path=''")
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('pg_advisory_xact_lock')
  })

  it('requires the exact 20-user, 14-day, two-feature, one-use contract',()=>{
    expect(sql).toContain("snapshot.max_users<>20")
    expect(sql).toContain("interval '14 days'")
    expect(sql).toContain("ARRAY['account_registration','private_profile']")
    expect(sql).toContain("requested_max_uses<>1")
    expect(sql).toContain("interval '7 days'")
    expect(sql).toContain('occupied+outstanding>=snapshot.max_users')
    expect(sql).toContain('{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}')
  })

  it('rejects legacy and paused invitations and binds members to one school',()=>{
    expect(sql).toContain("program.status<>'active'")
    expect(sql).toContain("program.program_key='limited_beta_2026'")
    expect(sql).toContain('program_id,user_id,invite_id,target_school_id,status')
    expect(sql).toContain('SCHOOL_OUTSIDE_BETA_SCOPE')
    expect(sql).toContain('SECOND_SCHOOL_NOT_ALLOWED')
    expect(sql).toContain('CREATE TRIGGER phase10j_beta_school_scope')
  })

  it('makes generic emergency clear fail closed',()=>{
    expect(sql).toContain("RAISE EXCEPTION 'REACTIVATION_REQUIRED'")
    expect(sql).toContain("action='controlled_beta_reactivated'")
    expect(sql).toContain('created_at>program.emergency_disabled_at')
    expect(sql).toContain('admin_record_beta_readiness')
    expect(sql).toContain('clock_timestamp()')
    expect(sql).toContain('AND f.enabled=false')
    expect(sql).not.toContain("f.enabled=false AND f.reason_code='EMERGENCY_DISABLED'")
  })
})
