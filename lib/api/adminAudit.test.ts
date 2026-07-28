import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const admin = read('lib/api/admin.ts')

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
    'app/api/admin/tools/level-sync/route.ts',
  ])('%s의 성공 mutation은 audit log를 요구한다', (path) => {
    const source = read(path)
    expect(source).toContain('recordAdminAuditLog')
    expect(source).toContain('Audit log failed')
  })
})
