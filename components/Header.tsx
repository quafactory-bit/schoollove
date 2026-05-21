'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Plus } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export default function Header() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (href: string) => pathname === href

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <div className="max-w-content mx-auto px-4 h-14 flex items-center justify-between">
        {/* 로고 */}
        <Link
          href="/"
          className="flex items-center gap-1 font-bold text-gray-900 tracking-tight"
        >
          <span className="text-lg">I</span>
          <span className="text-brand-blue text-xl font-black">♥</span>
          <span className="text-lg">SCHOOL</span>
        </Link>

        {/* 데스크탑 네비게이션 */}
        <nav className="hidden sm:flex items-center gap-1">
          <NavLink href="/search" active={isActive('/search')}>학교 검색</NavLink>
          <NavLink href="/submit" active={isActive('/submit')}>등록하기</NavLink>
          <NavLink href="/about" active={false}>이용안내</NavLink>
        </nav>

        {/* 모바일: 등록 버튼 + 햄버거 */}
        <div className="flex sm:hidden items-center gap-2">
          <Link
            href="/submit"
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-blue text-white text-sm font-medium rounded-full"
          >
            <Plus size={14} />
            등록
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 text-gray-600 rounded-lg hover:bg-gray-50"
            aria-label="메뉴"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* 모바일 드롭다운 */}
      {menuOpen && (
        <div className="sm:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
          <MobileNavLink href="/search" onClick={() => setMenuOpen(false)}>학교 검색</MobileNavLink>
          <MobileNavLink href="/submit" onClick={() => setMenuOpen(false)}>등록하기</MobileNavLink>
          <MobileNavLink href="/about" onClick={() => setMenuOpen(false)}>이용안내</MobileNavLink>
        </div>
      )}
    </header>
  )
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'px-3 py-1.5 text-sm rounded-lg transition-colors',
        active
          ? 'text-brand-blue font-semibold bg-brand-blue-light'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      )}
    >
      {children}
    </Link>
  )
}

function MobileNavLink({
  href,
  onClick,
  children,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
    >
      {children}
    </Link>
  )
}
