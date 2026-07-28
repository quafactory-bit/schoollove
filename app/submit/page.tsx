import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { getPublicRouteRobots } from '@/lib/policy/privacySafety'

export const metadata: Metadata = {
  title: '등록 기능 정비 안내',
  description: '성인 본인 인증 기반 등록으로 개편하는 동안 신규 개인 등록을 중단합니다.',
  robots: getPublicRouteRobots('submit'),
}

export default function SubmitMaintenancePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center px-5 py-12">
      <section className="w-full border border-schoollove-border bg-schoollove-surface p-6 sm:p-8" aria-labelledby="maintenance-title">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-schoollove-surface-subtle">
          <ShieldCheck className="h-6 w-6 text-schoollove-text" aria-hidden="true" />
        </div>
        <p className="schoollove-hud-label mt-6 text-[12px] tracking-[0.14em]">PRIVACY SAFETY UPDATE</p>
        <h1 id="maintenance-title" className="mt-3 break-keep text-2xl font-bold leading-snug text-schoollove-text sm:text-3xl">
          신규 개인 등록을 잠시 중단했습니다
        </h1>
        <p className="mt-4 break-keep text-sm leading-6 text-schoollove-secondary">
          스쿨러브아이는 만 19세 이상 이용자가 본인 정보만 등록하고, 상대방의 승인이 있기 전에는 개인 정보와 Instagram이 공개되지 않는 구조로 개편 중입니다.
        </p>
        <div className="mt-6 space-y-2 border-y border-schoollove-border py-5 text-sm leading-6 text-schoollove-text">
          <p>현재 신규 프로필 등록과 타인 정보 등록은 서버에서도 차단됩니다.</p>
          <p>기존 개인 명단과 Instagram은 공개 화면에서 제공하지 않습니다.</p>
          <p>기존 정보의 삭제·비공개·신고 요청은 운영자 문의를 이용해 주세요.</p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/search" className="schoollove-dark-action schoollove-focus inline-flex min-h-11 items-center bg-schoollove-text px-5 text-sm text-white">
            학교 검색하기
          </Link>
          <Link href="/contact" className="schoollove-focus inline-flex min-h-11 items-center border border-schoollove-border px-5 text-sm text-schoollove-text">
            운영자 문의
          </Link>
        </div>
      </section>
    </main>
  )
}
