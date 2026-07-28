import Link from 'next/link'
import { Search, ShieldCheck } from 'lucide-react'
import { getPublicPromotion } from '@/lib/promotions'
import TodayInstagramCard from '@/components/TodayInstagramCard'

export const revalidate = 60

export default async function HomePage() {
  const promotion = await getPublicPromotion({ placement: 'homepage_today' })
  return (
    <main className="mx-auto w-full max-w-[1180px] overflow-x-clip px-5 pb-16 sm:px-6 lg:px-8">
      <header className="pt-7 lg:pt-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/" className="schoollove-focus inline-flex min-h-11 items-center text-[18px] font-semibold tracking-tight text-schoollove-text">
              스쿨러브아이
            </Link>
            <p className="mt-1 text-[13px] text-schoollove-secondary">학교에서 시작하는 안전한 사람 연결</p>
          </div>
          <Link href="/search" className="schoollove-focus hidden min-h-11 items-center border border-schoollove-border px-4 text-[14px] text-schoollove-text lg:inline-flex">
            학교 찾기
          </Link>
        </div>

        <div className="mt-12 max-w-3xl lg:mt-20">
          <p className="schoollove-hud-label text-[12px] tracking-[0.14em] sm:text-[13px]">PRIVACY SAFETY UPDATE</p>
          <h1 className="mt-4 break-keep text-[36px] font-bold leading-[1.22] tracking-[-0.02em] text-schoollove-text sm:text-[44px] lg:text-[56px]">
            학교는 그대로,<br />개인 정보는 안전하게.
          </h1>
          <p className="mt-6 max-w-2xl break-keep text-[15px] leading-7 text-schoollove-secondary sm:text-[17px]">
            공개 개인 명단과 Instagram 노출을 중단했습니다. 만 19세 이상 본인 인증과 상호 승인 기반 연결 구조를 준비하고 있습니다.
          </p>
          <Link href="/search" className="schoollove-dark-action schoollove-focus mt-8 inline-flex min-h-12 items-center gap-2 bg-schoollove-text px-6 text-[15px] text-white">
            <Search className="h-4 w-4" aria-hidden="true" />
            학교 검색하기
          </Link>
        </div>
      </header>

      <section className="mt-14 grid gap-4 border-t border-schoollove-border pt-8 sm:grid-cols-3 lg:mt-20 lg:pt-10" aria-label="개인정보 안전 전환 현황">
        {[
          ['개인 명단', '공개 중단'],
          ['신규 등록', '일시 중단'],
          ['다음 단계', '성인 본인 인증'],
        ].map(([label, value]) => (
          <div key={label} className="border border-schoollove-border bg-schoollove-surface p-5">
            <ShieldCheck className="h-5 w-5 text-schoollove-text" aria-hidden="true" />
            <p className="mt-4 text-xs text-schoollove-secondary">{label}</p>
            <p className="mt-1 text-lg font-semibold text-schoollove-text">{value}</p>
          </div>
        ))}
      </section>

      {promotion ? <section className="mt-10"><TodayInstagramCard promotion={promotion} /></section> : null}

      <section className="mt-10 border border-schoollove-border bg-schoollove-surface-subtle p-6">
        <h2 className="text-lg font-semibold text-schoollove-text">기존 정보의 삭제·비공개가 필요하신가요?</h2>
        <p className="mt-2 text-sm leading-6 text-schoollove-secondary">운영자 문의로 요청해 주세요. 기존 데이터는 공개 화면에서 제거했으며 관리자 검토 경계는 유지합니다.</p>
        <Link href="/contact" className="schoollove-focus mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-schoollove-text underline underline-offset-4">
          운영자 문의하기
        </Link>
      </section>
    </main>
  )
}
