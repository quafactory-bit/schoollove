import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

type Props = {
  schoolName?: string
  title?: string
}

export default function PrivacyTransitionNotice({ schoolName, title = '개인 명단은 현재 공개하지 않습니다' }: Props) {
  return (
    <section className="border border-schoollove-border bg-schoollove-surface p-6 sm:p-8" aria-labelledby="privacy-transition-title">
      <ShieldCheck className="h-7 w-7 text-schoollove-text" aria-hidden="true" />
      <p className="schoollove-hud-label mt-5 text-[12px] tracking-[0.14em]">PRIVACY SAFETY UPDATE</p>
      <h1 id="privacy-transition-title" className="mt-3 break-keep text-2xl font-bold leading-snug text-schoollove-text">
        {title}
      </h1>
      <p className="mt-4 break-keep text-sm leading-6 text-schoollove-secondary">
        {schoolName ? `${schoolName}의 ` : ''}이름·졸업연도·반·Instagram을 결합한 공개 명단과 사람 검색을 중단했습니다.
        만 19세 이상 본인 인증과 상호 승인 기반 연결 기능을 준비하고 있습니다.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/search" className="schoollove-dark-action schoollove-focus inline-flex min-h-11 items-center bg-schoollove-text px-5 text-sm text-white">
          다른 학교 검색
        </Link>
        <Link href="/contact" className="schoollove-focus inline-flex min-h-11 items-center border border-schoollove-border px-5 text-sm text-schoollove-text">
          삭제·비공개 문의
        </Link>
      </div>
    </section>
  )
}
