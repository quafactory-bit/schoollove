'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export default function Header() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const isActive = (href: string) => pathname === href

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch('/api/connections/notifications/summary', { cache: 'no-store' })
        if (!response.ok) {
          if (active) setUnreadCount(null)
          return
        }
        const payload = await response.json() as { unreadCount?: unknown }
        if (active) setUnreadCount(typeof payload.unreadCount === 'number' && Number.isInteger(payload.unreadCount) && payload.unreadCount > 0 ? payload.unreadCount : null)
      } catch {
        if (active) setUnreadCount(null)
      }
    })()
    return () => { active = false }
  }, [pathname])

  const unreadLabel = unreadCount ? unreadCount > 9 ? '9+' : String(unreadCount) : null

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white">
      <div className="mx-auto flex h-14 max-w-content items-center justify-between px-4">
        <Link href="/" className="font-bold tracking-tight text-gray-900">스쿨러브아이</Link>

        <nav className="hidden items-center gap-1 sm:flex">
          <NavLink href="/search" active={isActive('/search')}>학교 검색</NavLink>
          <NavLink href="/submit" active={isActive('/submit')}>계정 시작</NavLink>
          <NavLink href="/account" active={isActive('/account')}>내 계정</NavLink>
          <NavLink href="/connections" active={isActive('/connections')} badge={unreadLabel}>내 연결</NavLink>
          <NavLink href="/privacy" active={isActive('/privacy')}>개인정보 안내</NavLink>
        </nav>

        <div className="flex items-center gap-2 sm:hidden">
          <Link href="/submit" className="flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1.5 text-sm font-medium text-white">
            <ShieldCheck size={14} />
            계정 안내
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-50"
            aria-label="메뉴"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="space-y-1 border-t border-gray-100 bg-white px-4 py-3 sm:hidden">
          <MobileNavLink href="/search" onClick={() => setMenuOpen(false)}>학교 검색</MobileNavLink>
          <MobileNavLink href="/submit" onClick={() => setMenuOpen(false)}>계정 시작</MobileNavLink>
          <MobileNavLink href="/account" onClick={() => setMenuOpen(false)}>내 계정</MobileNavLink>
          <MobileNavLink href="/connections" onClick={() => setMenuOpen(false)} badge={unreadLabel}>내 연결</MobileNavLink>
          <MobileNavLink href="/privacy" onClick={() => setMenuOpen(false)}>개인정보 안내</MobileNavLink>
        </div>
      )}
    </header>
  )
}

function NavLink({ href, active, badge, children }: { href: string; active: boolean; badge?: string | null; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
      )}
    >
      <span>{children}</span>{badge ? <span aria-label={`읽지 않은 알림 ${badge}개`} className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span> : null}
    </Link>
  )
}

function MobileNavLink({ href, onClick, badge, children }: { href: string; onClick: () => void; badge?: string | null; children: React.ReactNode }) {
  return <Link href={href} onClick={onClick} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"><span>{children}</span>{badge ? <span aria-label={`읽지 않은 알림 ${badge}개`} className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span> : null}</Link>
}
