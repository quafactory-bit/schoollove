import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(join(process.cwd(), 'app/api/admin/safety/route.ts'), 'utf8')
const service = readFileSync(join(process.cwd(), 'lib/connections.ts'), 'utf8')

describe('PHASE 10C admin safety boundary', () => {
  it('관리자 세션을 route 내부에서 검증하고 닫힌 action만 허용한다', () => {
    expect(route).toContain('verifySessionToken')
    expect(route).toContain("z.enum(['report_close','request_force_close','message_hide','account_suspend','account_restore'])")
  })

  it('일반 목록에 메시지·이름·Instagram 원문을 조회하지 않는다', () => {
    const start = service.indexOf('export async function getAdminSafetyReports')
    const end = service.indexOf('export async function applyAdminConnectionSafetyAction')
    const source = service.slice(start, end)
    expect(source).not.toMatch(/message,|display_name|instagram|private_profiles/)
    expect(source).toContain('reason_code,status')
  })

  it('관리자 mutation은 atomic audit RPC만 호출한다', () => {
    expect(service).toContain("rpc('admin_apply_connection_safety_action'")
    expect(route).not.toContain("from('admin_audit_logs')")
  })
})
