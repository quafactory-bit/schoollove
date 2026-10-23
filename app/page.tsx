import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublicAccountLaunchState, recordPublicAccountActivity } from '@/lib/publicAccountLaunch'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import SearchBar from '@/components/SearchBar'
import BrandMark from '@/components/BrandMark'
import HowItWorksStrip from '@/components/HowItWorksStrip'

export const dynamic = 'force-dynamic'

const HOME_TITLE = '그때 그 친구, 지금 뭐 하는지 궁금하지 않아요?'
const HOME_DESCRIPTION = '학교와 졸업연도로 같은 기수 출석부를 보고, 서로 수락하면 인스타그램 주소를 교환해요.'

export const metadata: Metadata = {
  title: { absolute: `스쿨러브아이 - ${HOME_TITLE}` },
  description: HOME_DESCRIPTION,
  openGraph: { title: HOME_TITLE, description: HOME_DESCRIPTION },
  alternates: { canonical: '/' },
}

// v2-04: 홈은 로그아웃 전용. 로그인 상태면 /account(06번에서 출석부)로 보낸다.
export default async function HomePage() {
  let signedIn = false
  try { signedIn = Boolean(await getAuthenticatedServerContext()) } catch { /* treat as signed out */ }
  if (signedIn) redirect('/account')

  const launch = await getPublicAccountLaunchState()
  await recordPublicAccountActivity('public_home_view', 'direct')
  return (
    <main className="mx-auto w-full max-w-content bg-white px-4 pb-6">
      <div className="flex h-12 items-center"><BrandMark /></div>
      <section aria-labelledby="home-title" className="pt-4">
        <h1 id="home-title" className="break-keep text-[28px] font-black leading-[1.2] tracking-[-0.6px] text-sl-ink">{HOME_TITLE}</h1>
        <p className="mt-2 break-keep text-[15px] leading-[1.5] text-sl-ink2">{HOME_DESCRIPTION}</p>
        {/* 검색창 아래 초록 버튼이 "내 학교 찾기"(검색어를 그대로 /search로 넘김) */}
        <SearchBar variant="home" className="mt-5" />
        <HowItWorksStrip />
        <p className="mt-3 text-center text-sm text-sl-ink2"><Link href="/search" className="schoollove-focus font-bold text-sl-brand-text underline">학교 찾기 화면으로 가기</Link></p>
        {launch.state === 'open'
          ? <p className="mt-3 text-center text-sm text-sl-ink2">이미 시작했다면 <Link href="/account" className="schoollove-focus font-bold text-sl-brand-text underline">내 학교로 들어가기</Link></p>
          : <p role="status" className="mt-3 text-center text-sm text-sl-ink2">계정 시작은 현재 준비 중입니다. 학교 정보는 계속 둘러볼 수 있어요.</p>}
      </section>
      <section aria-labelledby="home-privacy" className="mt-8 rounded-2xl bg-sl-bg2 px-4 py-4">
        <h2 id="home-privacy" className="text-[15px] font-extrabold text-sl-ink">개인 정보는 조심스럽게</h2>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-sl-ink2">학교 명단은 같은 학교에 등록하고 명단 표시를 켠 성인 회원끼리만 확인해요. 인스타그램 주소는 서로 수락할 때만 보여요. 만 19세 이상.</p>
        <p className="mt-3 flex flex-wrap gap-x-4 text-[13px] font-semibold text-sl-ink2">
          <Link className="schoollove-focus inline-flex min-h-11 items-center underline" href="/privacy">개인정보처리방침</Link>
          <Link className="schoollove-focus inline-flex min-h-11 items-center underline" href="/terms">이용약관</Link>
          <Link className="schoollove-focus inline-flex min-h-11 items-center underline" href="/contact">문의 및 삭제 요청</Link>
        </p>
      </section>
    </main>
  )
}
