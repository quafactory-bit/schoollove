import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const layout = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8')
const provider = readFileSync(join(ROOT, 'components', 'ConnectionNotificationProvider.tsx'), 'utf8')
const badge = readFileSync(join(ROOT, 'components', 'ConnectionNotificationBadge.tsx'), 'utf8')
const desktopNav = readFileSync(join(ROOT, 'components', 'DesktopNav.tsx'), 'utf8')

describe('connection notification navigation integration', () => {
  it('mounts the shared provider, desktop navigation, and mobile navigation from RootLayout', () => {
    expect(layout).toContain('<ConnectionNotificationProvider>')
    expect(layout).toContain('<DesktopNav />')
    expect(layout).toContain('<TabBar />')
  })

  it('uses one event-driven no-store summary refresh path and hides the badge on every error path', () => {
    expect(provider).toContain("fetch('/api/connections/notifications/summary', { cache: 'no-store' })")
    expect(provider).toContain("window.addEventListener('connection-notifications-changed', loadUnreadCount)")
    expect(provider).toContain("window.removeEventListener('connection-notifications-changed', loadUnreadCount)")
    expect(provider).not.toContain('setInterval')
    expect(provider).toContain('setUnreadCount(null)')
  })

  it('keeps private desktop navigation out of public and admin routes while exposing the three private destinations', () => {
    expect(desktopNav).toContain("className=\"hidden border-b border-schoollove-border bg-schoollove-surface lg:block\"")
    expect(desktopNav).toContain("href=\"/account\"")
    expect(desktopNav).toContain("href=\"/people/search\"")
    expect(desktopNav).toContain("href=\"/connections\"")
    expect(desktopNav).toContain("if (!isPrivateNavigationPath(pathname)) return null")
    expect(desktopNav).not.toContain("'/admin'")
  })

  it('formats only safe unread counts and removes the obsolete global Header', () => {
    expect(badge).toContain("if (!unreadCount) return null")
    expect(badge).toContain("unreadCount > 9 ? '9+' : String(unreadCount)")
    expect(badge).not.toContain('notification.type')
    expect(existsSync(join(ROOT, 'components', 'Header.tsx'))).toBe(false)
  })
})
