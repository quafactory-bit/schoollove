import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const admin = read('lib/api/admin.ts')
const migration = read('supabase/migrations/20260728150000_auth_adult_profile_ownership.sql')

describe('PHASE 10B admin audit compatibility', () => {
  it('audit log는 service-role helper 안에서만 기록한다', () => {
    expect(admin).toMatch(/recordAdminAuditLog[\s\S]*tryGetAdminClient\(\)[\s\S]*\.from\('admin_audit_logs'\)\.insert/)
    expect(admin).not.toMatch(/recordAdminAuditLog[\s\S]*supabaseServer\.from\('admin_audit_logs'\)/)
  })

  it.each([
    'app/api/admin/profiles/route.ts',
    'app/api/admin/profiles/[id]/route.ts',
    'app/api/admin/reports/route.ts',
    'app/api/admin/delete-requests/route.ts',
    'app/api/admin/edit-requests/route.ts',
  ])('%s의 moderation mutation은 atomic DB action을 사용한다', (path) => {
    const source = read(path)
    expect(source).toContain('applyAdminModerationAction')
    expect(source).not.toContain('recordAdminAuditLog')
  })

  it('moderation RPC는 mutation과 audit insert를 한 transaction에 둔다', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.admin_apply_moderation_action')
    expect(migration).toMatch(/admin_apply_moderation_action[\s\S]*INSERT INTO public\.admin_audit_logs/)
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.admin_apply_moderation_action(text, uuid) TO service_role;')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated;')
  })

  it('level sync는 별도 audit 실패를 성공으로 응답하지 않는다', () => {
    const source = read('app/api/admin/tools/level-sync/route.ts')
    expect(source).toContain('recordAdminAuditLog')
    expect(source).toContain('Audit log failed')
  })
})
