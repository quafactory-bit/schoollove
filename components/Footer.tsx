import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-sl-line bg-white">
      <div className="mx-auto max-w-content px-4 py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12.5px] font-semibold text-sl-ink2">
          <Link href="/privacy" className="inline-flex min-h-11 items-center">개인정보처리방침</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="inline-flex min-h-11 items-center">이용약관</Link>
          <span aria-hidden="true">·</span>
          <Link href="/contact" className="inline-flex min-h-11 items-center">문의 및 삭제 요청</Link>
        </div>
        <div className="mt-4 text-center text-xs text-schoollove-text">© 2026 스쿨러브아이. All rights reserved.</div>
      </div>
    </footer>
  )
}
