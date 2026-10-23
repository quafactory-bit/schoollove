import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(join(__dirname, 'TabBar.tsx'), 'utf8')
const LAYOUT_SOURCE = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8')

// v2-03: 인스타·스레드 문법의 아이콘 4탭(홈 / 학교 찾기 / 알림 / 내 출석부), 모든 폭에서 표시.
describe('TabBar v2 navigation contract', () => {
  it('stays fixed to the viewport bottom on every width, centered at the 600px content width', () => {
    expect(SOURCE).toContain('fixed inset-x-0 bottom-0')
    expect(SOURCE).not.toContain('lg:hidden')
    expect(SOURCE).toContain('max-w-content')
  })

  it('keeps the navigation attached to the viewport bottom with safe-area padding', () => {
    expect(SOURCE).toContain("paddingBottom: 'env(safe-area-inset-bottom)'")
  })

  it('keeps page content clear of the fixed navigation', () => {
    expect(LAYOUT_SOURCE).toContain('className="pb-16"')
  })

  it('shows exactly the four v2 tabs with lucide icons', () => {
    expect(SOURCE).toContain("{ href: '/', label: '홈', icon: House")
    expect(SOURCE).toContain("{ href: '/search', label: '학교 찾기', icon: Search")
    expect(SOURCE).toContain("{ href: '/notifications', label: '알림', icon: Bell")
    expect(SOURCE).toContain("{ href: '/account', label: '내 출석부', icon: User")
    expect(SOURCE).not.toContain("label: '내 연결'")
    expect(SOURCE).not.toContain("label: '내 계정'")
  })

  it('marks the selected tab black, others gray, and shows a green dot only for unread notifications', () => {
    expect(SOURCE).toContain("active ? 'text-sl-ink' : 'text-sl-ink3'")
    expect(SOURCE).toContain('useConnectionNotificationUnreadCount()')
    expect(SOURCE).toContain('dot && unreadCount ?')
    expect(SOURCE).toContain('bg-sl-brand')
  })

  it('keeps every tab at a 44px+ touch height with route-aware active state and hides on admin', () => {
    expect(SOURCE).toContain('min-h-14 min-w-0 flex-1')
    expect(SOURCE).toContain('pathname.startsWith(`${href}/`)')
    expect(SOURCE).toContain("if (pathname.startsWith('/admin')) return null")
  })
})
