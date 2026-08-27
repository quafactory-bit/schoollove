import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe,expect,it } from 'vitest'

const migration=readFileSync(join(process.cwd(),'supabase/migrations/20260827090000_people_discovery_controlled_beta_contract.sql'),'utf8')
const body=(name:string)=>{
  const start=migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  if(start<0) throw new Error(`missing function ${name}`)
  const next=migration.indexOf('CREATE OR REPLACE FUNCTION public.',start+1)
  return migration.slice(start,next<0?migration.length:next)
}

describe('PHASE 10X controlled-beta contract migration',()=>{
  it('is additive function replacement only with no schema object delta',()=>{
    expect(migration.match(/^CREATE OR REPLACE FUNCTION /gm)).toHaveLength(6)
    expect(migration).not.toMatch(/^CREATE TABLE |^ALTER TABLE |ADD COLUMN|^CREATE FUNCTION /m)
  })

  it('recognizes only the two exact cardinality-two feature contracts',()=>{
    for(const name of ['admin_save_beta_setup','admin_activate_beta_setup','admin_configure_controlled_beta_features','admin_start_controlled_beta_program','admin_reactivate_controlled_beta_program']){
      const sql=body(name)
      expect(sql).toContain("cardinality(")
      expect(sql).toContain("ARRAY['account_registration','private_profile']::text[]")
      expect(sql).toContain("ARRAY['people_search','connection_request']::text[]")
      expect(sql).toContain('@>')
      expect(sql).toContain('<@')
    }
  })

  it('keeps the immutable snapshot authoritative during feature configuration',()=>{
    const sql=body('admin_configure_controlled_beta_features')
    expect(sql).toContain('requested_enabled_features @> snapshot.enabled_features')
    expect(sql).toContain('requested_enabled_features <@ snapshot.enabled_features')
    expect(sql).toContain('count(*)=8')
    expect(sql).toContain('feature_key=ANY(snapshot.enabled_features)')
    expect(sql).toContain('feature_key<>ALL(snapshot.enabled_features)')
  })

  it('requires exact snapshot flags and global non-stop for start and reactivation',()=>{
    for(const name of ['admin_start_controlled_beta_program','admin_reactivate_controlled_beta_program']){
      const sql=body(name)
      expect(sql).toContain('flag_count<>8 OR enabled_count<>2')
      expect(sql).toContain('feature_key<>ALL(snapshot.enabled_features)')
      expect(sql).toContain('feature_key=ANY(snapshot.enabled_features) AND enabled=false')
      expect(sql).toContain("interval '14 days'")
      expect(sql).toContain('snapshot.max_users<>20')
    }
  })

  it('keeps feature access snapshot-backed, single-school, active, and fail-closed',()=>{
    const sql=body('has_beta_feature_access')
    expect(sql).toContain("member.status='active' AND program.status='active'")
    expect(sql).toContain('program.emergency_disabled_at IS NULL')
    expect(sql).toContain('JOIN public.beta_program_setup_snapshots snapshot')
    expect(sql).toContain('JOIN public.beta_program_schools allowed')
    expect(sql).toContain('member.target_school_id=allowed.school_id')
    expect(sql).toContain('requested_feature=ANY(snapshot.enabled_features)')
    expect(sql).toContain("requested_feature='connection_request'")
    expect(sql).toContain("dependency_stop.feature_key='people_search' AND dependency_stop.enabled=false")
    expect(sql).not.toContain('snapshot.id IS NULL')
  })

  it('preserves least-privilege execution grants',()=>{
    for(const name of ['admin_save_beta_setup','admin_activate_beta_setup','admin_configure_controlled_beta_features','admin_start_controlled_beta_program','admin_reactivate_controlled_beta_program']){
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC,anon,authenticated;`))
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role;`))
    }
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.has_beta_feature_access(uuid,text) FROM PUBLIC,anon,authenticated;')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.has_beta_feature_access(uuid,text) TO authenticated,service_role;')
  })
})
