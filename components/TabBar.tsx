'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, UserRound } from 'lucide-react'

const TABS = [
  { href: '/', label: '홈', icon: Home },
  { href: '/search', label: '학교 찾기', icon: Search },
  { href: '/account', label: '내 계정', icon: UserRound },
]

export default function TabBar() {
  const pathname = usePathname()
  if (pathname.startsWith('/admin')) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-schoollove-border bg-schoollove-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-[420px] sm:max-w-[320px]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`schoollove-focus flex min-h-11 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                active ? 'text-schoollove-text' : 'text-schoollove-muted'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
