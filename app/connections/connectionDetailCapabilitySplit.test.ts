import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const client = read('app/connections/[id]/ConversationClient.tsx')
const detailRoute = read('app/api/connections/[id]/route.ts')
const messageRoute = read('app/api/connections/[id]/messages/route.ts')
const instagramRoute = read('app/api/connections/[id]/instagram/route.ts')
const connectionsRoute = read('app/api/connections/route.ts')
const requestActionRoute = read('app/api/connections/requests/[id]/route.ts')
const service = read('lib/connections.ts')

describe('connection detail client capability contract', () => {
  it('loads participant-safe detail before independently gated capabilities', () => {
    expect(client).toContain('fetch(`/api/connections/${connectionId}`)')
    expect(client).toContain('if (data.capabilities.messaging) await loadMessages()')
    expect(client).toContain('if (data.capabilities.instagramPermission) await loadInstagram()')
    expect(detailRoute).toContain('getConnectionDetail')
    expect(detailRoute).toContain("hasBetaFeatureAccess(context.auth.client, context.auth.user.id, 'messaging')")
    expect(detailRoute).toContain("hasBetaFeatureAccess(context.auth.client, context.auth.user.id, 'instagram_permission')")
    expect(service).toContain('export async function getConnectionDetail')
    const detailService = service.slice(
      service.indexOf('export async function getConnectionDetail'),
      service.indexOf('type InstagramPermissionRow'),
    )
    expect(detailService).toContain('![row.user_low_id, row.user_high_id].includes(userId)')
    expect(detailService).toContain(".select('display_name')")
    expect(detailService).not.toMatch(/instagram|email|school|message/i)
  })

  it('does not weaken the existing message or Instagram feature gates', () => {
    expect(messageRoute.match(/requireConnectionContext\(request, 'message'\)/g)).toHaveLength(3)
    expect(instagramRoute.match(/requireConnectionContext\(request, 'instagram'\)/g)).toHaveLength(2)
  })

  it('renders disabled messaging guidance without a form and hides Instagram controls', () => {
    expect(client).toContain("capabilities.messaging ?")
    expect(client).toContain('메시지 기능은 현재 이 베타에서 제공되지 않습니다.')
    expect(client).toContain("capabilities.instagramPermission ?")
    expect(client).toContain('내 Instagram 공개')
    expect(client).toContain('공개 취소')
  })

  it('preserves disconnect, block and report controls after detail load', () => {
    expect(client).toContain('연결 해제')
    expect(client).toContain('차단')
    expect(client).toContain('신고')
    expect(detailRoute.match(/requireConnectionContext\(request, 'response', \[\]\)/g)).toHaveLength(2)
  })

  it('uses finite loading and a safe explicit detail error state', () => {
    expect(client).toContain("useState<'loading' | 'loaded' | 'error'>('loading')")
    expect(client).toContain('연결 정보를 불러올 수 없습니다.')
    expect(client).toMatch(/catch \{\s+setLoadState\('error'\)/)
    expect(client).toMatch(/catch \{\s+setMessagesState\('error'\)/)
    expect(client).not.toContain('if (!conversation) return')
  })

  it('keeps connection-list and request-response routes independent from messaging', () => {
    expect(connectionsRoute).toContain('requireConnectionContext(request)')
    expect(connectionsRoute).not.toContain("requireConnectionContext(request, 'message')")
    expect(requestActionRoute).toContain("['people_search','connection_request']")
  })
})
