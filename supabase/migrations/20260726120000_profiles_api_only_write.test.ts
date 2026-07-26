import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260726120000_profiles_api_only_write.sql'
)
const sql = readFileSync(migrationPath, 'utf8')
const statements = sql.replace(/^\s*--.*$/gm, '')

describe('profiles API-only write migration', () => {
  it('anon/authenticated의 테이블·컬럼 INSERT 권한과 profiles_insert 정책을 회수한다', () => {
    expect(statements).toMatch(
      /REVOKE INSERT ON TABLE public\.profiles FROM anon, authenticated;/
    )
    expect(statements).toMatch(
      /REVOKE INSERT \([\s\S]*?message\s*\) ON public\.profiles FROM anon, authenticated;/
    )
    expect(statements).toMatch(
      /DROP POLICY IF EXISTS "profiles_insert" ON public\.profiles;/
    )
  })

  it('SELECT/UPDATE/DELETE 권한과 공개 read 정책을 변경하지 않는다', () => {
    expect(statements).not.toMatch(/(?:GRANT|REVOKE)\s+(?:SELECT|UPDATE|DELETE)/i)
    expect(statements).not.toMatch(/profiles_read|profiles_select_visible/)
  })

  it('데이터 행을 쓰거나 service_role 권한을 축소하지 않는다', () => {
    expect(statements).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\b/i)
    expect(statements).not.toMatch(/(?:REVOKE|DROP).*service_role/i)
  })
})
