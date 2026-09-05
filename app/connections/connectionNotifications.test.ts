import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const client = read('app/connections/ConnectionsClient.tsx')
const header = read('components/Header.tsx')
const exportSource = read('lib/dataExport.ts')

describe('connection notifications product contract', () => {
  it('uses app-only copy and destinations without identity or private-data fields', () => {
    expect(client).toContain("request_received: '새 안부가 도착했어요.'")
    expect(client).toContain("request_reminded: '받은 안부가 다시 알려졌어요.'")
    expect(client).toContain("request_accepted: '안부가 수락되어 연결됐어요.'")
    expect(client).toContain("return type === 'request_accepted' ? 'connected' : 'received'")
    const notificationSection = client.slice(client.indexOf('const notificationCopy'), client.indexOf('<section id="received"'))
    expect(notificationSection).not.toMatch(/senderName|displayName|schoolName|graduation|instagram|message/i)
  })

  it('loads on mount and refreshes once after a local read event, with no polling or realtime subscription', () => {
    expect(header).toContain("/api/connections/notifications/summary")
    expect(header).toContain("window.addEventListener('connection-notifications-changed', loadUnreadCount)")
    expect(client).toContain("window.dispatchEvent(new Event('connection-notifications-changed'))")
    expect(header).toContain('}, [pathname])')
    expect(header).not.toMatch(/setInterval|realtime|Notification\.requestPermission|serviceWorker|websocket/i)
    expect(client).toContain("fetch('/api/connections/notifications')")
    expect(client).not.toMatch(/notifications[\s\S]*\/messages|notifications[\s\S]*instagram/i)
  })

  it('renders the connection nav badge only for a non-zero unread count', () => {
    expect(header).toContain("const unreadLabel = unreadCount ? unreadCount > 9 ? '9+' : String(unreadCount) : null")
    expect(header).toContain('내 연결')
    expect(header).toContain('badge={unreadLabel}')
  })

  it('adds only event type and timestamps to the owner export', () => {
    const notificationExport = exportSource.match(/\.from\('notifications'\)\.select\('([^']+)'\)/)?.[1]
    expect(notificationExport).toBe('kind,created_at,read_at')
    expect(exportSource).toContain(".eq('in_app_visible',true).not('request_id','is',null)")
    expect(exportSource).toContain("event_type: kind === 'connection_request' ? 'request_received'")
    expect(notificationExport).not.toMatch(/request_id|user_id/)
  })
})
