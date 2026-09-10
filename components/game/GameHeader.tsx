import Link from 'next/link'
import { Heart } from 'lucide-react'

export default function GameHeader() {
  return <header className="sl-game-header">
    <Link href="/" className="schoollove-focus sl-game-brand" aria-label="스쿨러브아이 홈"><Heart fill="currentColor" aria-hidden="true" /><span>SchoolLove</span></Link>
    <nav aria-label="학교 성장 탐색" className="sl-game-links">
      <Link className="schoollove-focus" href="/search">학교 찾기</Link>
      <Link className="schoollove-focus" href="/#weekly-growth">성장 순위</Link>
      <Link className="schoollove-focus" href="/#growth-how">학교 키우는 방법</Link>
    </nav>
    <Link className="schoollove-focus sl-header-account" href="/account">내 학교 <span aria-hidden="true">↗</span></Link>
  </header>
}
