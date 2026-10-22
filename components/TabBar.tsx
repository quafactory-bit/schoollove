'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, House, Search, User } from 'lucide-react'
import { useConnectionNotificationUnreadCount } from '@/components/ConnectionNotificationProvider'

// v2: 인스타·스레드 문법의 아이콘 4탭. 선택 탭 검정, 비선택 회색, 알림 미확인이면 초록 점.
// 클래스명 sl-tabbar-v2: v1 game.css·fantasy.css의 .sl-tabbar 덮어쓰기(분홍 선택색·둥근 모서리)를 받지 않는다.
const TABS = [
  { href: '/', label: '홈', icon: House, match: ['/'] },
  { href: '/search', label: '학교 찾기', icon: Search, match: ['/search', '/school'] },
  { href: '/notifications', label: '알림', icon: Bell, match: ['/notifications', '/connections'], dot: true },
  { href: '/account', label: '내 출석부', icon: User, match: ['/account', '/people'] },
]

function isActive(pathname: string, match: string[]) {
  return match.some((href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)))
}

export default function TabBar() {
  const pathname = usePathname()
  const unreadCount = useConnectionNotificationUnreadCount()
  if (pathname.startsWith('/admin')) return null

  return (
    <nav
      aria-label="주요 메뉴"
      className="sl-tabbar-v2 fixed inset-x-0 bottom-0 z-40 border-t border-sl-line bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-content px-2">
        {TABS.map(({ href, label, icon: Icon, match, dot }) => {
          const active = isActive(pathname, match)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`schoollove-focus relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-bold transition-colors ${
                active ? 'text-sl-ink' : 'text-sl-ink3'
              }`}
            >
              <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
              <span className="whitespace-nowrap">{label}</span>
              {dot && unreadCount ? (
                <span aria-label="읽지 않은 알림이 있어요" className="absolute left-[calc(50%+6px)] top-1.5 h-2 w-2 rounded-full border-2 border-white bg-sl-brand" />
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
