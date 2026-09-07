import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync(new URL('./20260907031506_class_history_self_service.sql', import.meta.url), 'utf8')
describe('class history schema and privacy boundary', () => {
  it('adds one owner RPC without widening table or feature contracts', () => {
    expect(sql.match(/CREATE FUNCTION/g)).toHaveLength(1)
    expect(sql).not.toMatch(/CREATE (?:TABLE|INDEX|TRIGGER)|ALTER TABLE|UPDATE public\./)
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(sql).toContain("requester uuid := auth.uid()")
    expect(sql).toContain("FROM PUBLIC, anon")
    expect(sql).toContain('TO authenticated, service_role')
  })
  it('has three narrow school-scoped paths and explicit safety', () => {
    expect(sql).toContain('public_write_allowed OR onboarding_write_allowed OR people_discovery_write_allowed')
    expect(sql).toContain('member.target_school_id = membership.school_id')
    expect(sql).toContain('public.is_people_discovery_beta_contract(member.program_id)')
    expect(sql).toContain("deletion.status <> 'rejected'")
    expect(sql).toContain("control.state = 'emergency_stopped'")
    expect(sql).not.toContain("has_beta_feature_access(requester, 'private_profile')")
  })
  it('serializes candidate discovery and repeats all checks before token creation', () => {
    expect(sql).toContain('FOR validation_pass IN 1..2 LOOP')
    expect(sql).toContain('hashtextextended(LEAST(actor_user_id::text, matched_user::text), 0)')
    expect(sql).toContain('hashtextextended(GREATEST(actor_user_id::text, matched_user::text), 0)')
    expect(sql).toContain('matched_user IS DISTINCT FROM original_matched_user')
    expect(sql.lastIndexOf('END LOOP;')).toBeLessThan(sql.indexOf('opaque_token := extensions.uuid_generate_v4()'))
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.find_exact_private_profile_match(')
  })
  it('does not change public/personal data, relationships, registration or notifications', () => {
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:profile_school_memberships|private_profiles|connections|connection_requests|connection_messages|connection_instagram_permissions|notifications|beta_)/)
    expect(sql).not.toMatch(/RAISE (?:LOG|NOTICE)|increment_.*metric/)
  })
})
