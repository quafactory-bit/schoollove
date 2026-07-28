import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-schoollove-border bg-schoollove-surface">
      <div className="mx-auto max-w-[600px] px-5 py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-sm text-schoollove-text">
            <span className="font-bold text-schoollove-text">스쿨러브아이</span>
            <span className="mx-2">·</span>
            <span>안전한 학교 정보 찾기</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-schoollove-text">
            <Link href="/contact" className="inline-flex min-h-11 items-center">문의 및 삭제 요청</Link>
            <span>·</span>
            <Link href="/terms" className="inline-flex min-h-11 items-center">이용약관</Link>
            <span>·</span>
            <Link href="/privacy" className="inline-flex min-h-11 items-center">개인정보처리방침</Link>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-schoollove-text">© 2026 스쿨러브아이. All rights reserved.</div>
      </div>
    </footer>
  )
}
