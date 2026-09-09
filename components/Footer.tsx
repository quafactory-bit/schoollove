import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-schoollove-border bg-schoollove-surface">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-sm text-schoollove-text">
            <span className="font-bold text-schoollove-text">스쿨러브아이</span>
            <span className="mx-2">·</span>
            <span>우리 학교, 함께 키우기</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-schoollove-secondary">
            <Link href="/contact" className="inline-flex min-h-11 items-center">문의 및 삭제 요청</Link>
            <span>·</span>
            <Link href="/terms" className="inline-flex min-h-11 items-center">이용약관</Link>
            <span>·</span>
            <Link href="/privacy" className="inline-flex min-h-11 items-center">개인정보처리방침</Link>
            <span>·</span>
            <Link href="/advertising-policy" className="inline-flex min-h-11 items-center">프로모션 정책</Link>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-schoollove-text">© 2026 스쿨러브아이. All rights reserved.</div>
      </div>
    </footer>
  )
}
