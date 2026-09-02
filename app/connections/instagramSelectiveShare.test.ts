import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const client = read('app/connections/[id]/ConversationClient.tsx')
const route = read('app/api/connections/[id]/instagram/route.ts')
const service = read('lib/connections.ts')
const connectionSql = read('supabase/migrations/20260728180000_safe_connection_request_messaging.sql')
const searchRoute = read('app/api/connections/search/route.ts')
const requestRoute = read('app/api/connections/requests/route.ts')

describe('connected Instagram selective-share product contract', () => {
  it('makes zero Instagram requests and renders zero Instagram product controls while the feature is off', () => {
    expect(client).toContain('if (data.capabilities.instagramPermission) await loadInstagram()')
    expect(client).toContain('capabilities.instagramPermission ? <section')
    expect(client).toContain('capabilities.instagramPermission && instagramState?.instagramHandle')
    expect(client).not.toMatch(/useEffect\([\s\S]*loadInstagram\(\)[\s\S]*\}, \[loadInstagram\]\)/)
  })

  it('provides the no-handle setup CTA without a POST path', () => {
    expect(client).toContain('Instagram 아이디를 등록하면 연결된 사람에게 선택적으로 공개할 수 있습니다.')
    expect(client).toContain('href="/account"')
    expect(client).toContain('내 계정에서 Instagram 등록')
    expect(client).toContain("if (method === 'POST' && !instagramState.myInstagramConfigured) return")
    expect(route).toContain("{ error: 'INSTAGRAM_HANDLE_REQUIRED' }")
  })

  it('renders one publish or revoke action from the directed actor state', () => {
    expect(client).toContain('이 연결 상대에게만 공개됩니다.')
    expect(client).toContain('내 Instagram 공개')
    expect(client).toContain('이 연결 상대에게 내 Instagram이 공개되어 있습니다.')
    expect(client).toContain('Instagram 공개 취소')
    expect(client).toMatch(/myInstagramVisible \? <>[\s\S]*changeInstagram\('DELETE'\)[\s\S]*: instagramState\.myInstagramConfigured \? <>[\s\S]*changeInstagram\('POST'\)/)
  })

  it('does not query or return the counterpart handle before their directed grant exists', () => {
    const stateService = service.slice(
      service.indexOf('export async function getConnectionInstagramState'),
      service.indexOf('export async function getConversation'),
    )
    expect(stateService).toContain('counterpartGranted')
    expect(stateService.indexOf('if (counterpartGranted)')).toBeLessThan(stateService.lastIndexOf(".select('instagram_handle')"))
    expect(route).toContain('NextResponse.json(state')
    expect(route).not.toMatch(/profile|userId|otherId|email|school|graduation|class/i)
  })

  it('keeps independent one-way rows and revokes only the actor direction', () => {
    expect(connectionSql).toContain('UNIQUE (connection_id, grantor_user_id, grantee_user_id)')
    expect(connectionSql).toContain('VALUES (conn.id,actor_user_id,other_user')
    expect(connectionSql).toContain('grantor_user_id=actor_user_id AND grantee_user_id=other_user')
    expect(service).toContain('permission.grantor_user_id === userId && permission.grantee_user_id === otherId')
    expect(service).toContain('permission.grantor_user_id === otherId && permission.grantee_user_id === userId')
  })

  it('requires an active participant without either-direction blocking', () => {
    expect(service).toContain("row.status !== 'active'")
    expect(service).toContain('![row.user_low_id, row.user_high_id].includes(userId)')
    expect(service).toContain("admin.from('user_blocks')")
    const rpc = connectionSql.slice(
      connectionSql.indexOf('set_connection_instagram_permission'),
      connectionSql.indexOf('admin_apply_connection_safety_action'),
    )
    expect(rpc).toContain("conn.status <> 'active'")
    expect(rpc).toContain('public.user_blocks')
  })

  it('revokes both directions on disconnect, report and block', () => {
    for (const startName of ['disconnect_connection', 'report_connection_safety', 'block_connection_user']) {
      const start = connectionSql.indexOf(`CREATE OR REPLACE FUNCTION public.${startName}`)
      const end = connectionSql.indexOf('CREATE OR REPLACE FUNCTION public.', start + 40)
      expect(connectionSql.slice(start, end)).toMatch(/connection_instagram_permissions[\s\S]*status='revoked'/)
    }
  })

  it('keeps RLS forced and mutation authority service-role only', () => {
    expect(connectionSql).toContain('ALTER TABLE public.connection_instagram_permissions ENABLE ROW LEVEL SECURITY;')
    expect(connectionSql).toContain('ALTER TABLE public.connection_instagram_permissions FORCE ROW LEVEL SECURITY;')
    expect(connectionSql).toContain('REVOKE ALL ON FUNCTION public.set_connection_instagram_permission(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;')
    expect(connectionSql).toContain('GRANT EXECUTE ON FUNCTION public.set_connection_instagram_permission(uuid,uuid,boolean) TO service_role;')
  })

  it('does not add Instagram disclosure to people search or pending requests', () => {
    expect(searchRoute).not.toMatch(/instagram/i)
    expect(requestRoute).not.toMatch(/instagram/i)
  })

  it('does not change the messaging-off contract', () => {
    expect(client).toContain('메시지 기능은 현재 이 베타에서 제공되지 않습니다.')
    expect(client).toContain('if (data.capabilities.messaging) await loadMessages()')
  })
})
