import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync(new URL('./20260907031506_class_history_self_service.sql', import.meta.url), 'utf8')
describe('class history schema and privacy boundary', () => {
  it('adds one owner RPC without widening table or feature contracts', () => {
    expect(sql.match(/CREATE FUNCTION/g)).toHaveLength(1)
    expect(sql).not.toMatch(/CREATE (?:TABLE|INDEX|TRIGGER)|ALTER TABLE|UPDATE public\.|actor_user_id/)
    expect(sql).toContain("requester uuid := auth.uid()")
    expect(sql).toContain("FROM PUBLIC, anon")
    expect(sql).toContain('TO authenticated, service_role')
  })
  it('does not change public/personal data, relationships, registration or notifications', () => {
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:profile_school_memberships|private_profiles|connections|connection_requests|connection_messages|connection_instagram_permissions|notifications|beta_)/)
    expect(sql).not.toMatch(/RAISE (?:LOG|NOTICE)|increment_.*metric/)
  })
})
