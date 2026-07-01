'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, PenLine, Share2 } from 'lucide-react'
// 탭 3개: 찾기 / 남기기 / 초대
const TABS = [
  { href: '/', label: '학교 찾기', icon: Search },
  { href: '/submit', label: '이름 남기기', icon: PenLine },
  { href: '/invite', label: '친구 초대', icon: Share2 },
]
export default function TabBar() {
  const pathname = usePathname()
  // 관리자 페이지에서는 탭바 숨김
  if (pathname.startsWith('/admin')) return null
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-100 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-[600px]">
        {TABS.map(({ href, label, icon: Icon }) => {
          // 활성 판정: 홈은 정확히 '/', 나머지는 경로 시작이 일치하면 활성
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                active ? 'text-neutral-900' : 'text-neutral-400'
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
