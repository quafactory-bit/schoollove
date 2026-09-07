'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, UserRound, UsersRound } from 'lucide-react'
import ConnectionNotificationBadge from '@/components/ConnectionNotificationBadge'

function isPrivateNavigationPath(pathname: string) {
  return pathname === '/account'
    || pathname.startsWith('/account/')
    || pathname === '/people'
    || pathname.startsWith('/people/')
    || pathname === '/connections'
    || pathname.startsWith('/connections/')
    || pathname === '/notifications'
    || pathname.startsWith('/notifications/')
}

export default function DesktopNav() {
  const pathname = usePathname()
  if (!isPrivateNavigationPath(pathname)) return null

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  return (
    <nav aria-label="비공개 계정 탐색" className="hidden border-b border-schoollove-border bg-schoollove-surface lg:block">
      <div className="mx-auto flex max-w-content items-center justify-end gap-2 px-5 py-3">
        <DesktopNavLink href="/account" active={isActive('/account')} icon={UserRound}>내 계정</DesktopNavLink>
        <DesktopNavLink href="/people/search" active={isActive('/people')} icon={Search}>사람 찾기</DesktopNavLink>
        <DesktopNavLink href="/connections" active={isActive('/connections')} icon={UsersRound} badge>내 연결</DesktopNavLink>
      </div>
    </nav>
  )
}

function DesktopNavLink({ href, active, icon: Icon, badge = false, children }: { href: string; active: boolean; icon: typeof UserRound; badge?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`schoollove-focus relative inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${active ? 'bg-schoollove-text text-white' : 'text-schoollove-text hover:bg-gray-100'}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{children}</span>
      {badge ? <ConnectionNotificationBadge className="ml-1" /> : null}
    </Link>
  )
}
