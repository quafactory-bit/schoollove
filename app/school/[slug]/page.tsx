import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getSchoolPageMetadata } from '@/lib/seo'
import { getPublicRouteRobots } from '@/lib/policy/privacySafety'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import GrowthMeter from '@/components/growth/GrowthMeter'
import GrowthShareButton from '@/components/growth/GrowthShareButton'
import GrowthReferralLanding from '@/components/growth/GrowthReferralLanding'
import { getSchoolGrowth } from '@/lib/schoolGrowthGame'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { getPublicAccountLaunchState } from '@/lib/publicAccountLaunch'
import TodayInstagramCard from '@/components/TodayInstagramCard'
import { getPublicPromotion } from '@/lib/promotions'
import { SchoolJoinButton } from '@/components/growth/SchoolSelection'
import GrowthHowItWorks from '@/components/growth/GrowthHowItWorks'
import SchoolWorld from '@/components/game/SchoolWorld'
import GameHeader from '@/components/game/GameHeader'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return { title: '학교를 찾을 수 없습니다', robots: getPublicRouteRobots('year') }

  return {
    ...getSchoolPageMetadata(school),
    title: `${school.school_name} · 우리 학교 함께 키우기`,
    description: `${school.school_name}의 레벨을 확인하고 친구와 함께 다음 레벨에 도전해요. 개인 정보는 비공개로 관리합니다.`,
    openGraph: { title: `${school.school_name} · 우리 학교 함께 키우기`, description: '우리 학교 같이 키워보자. 개인 명단 없이 함께 올리는 학교 레벨.' },
    twitter: { card: 'summary_large_image', title: `${school.school_name} · 우리 학교 함께 키우기`, description: '우리 학교 같이 키워보자.' },
    robots: getPublicRouteRobots('school'),
  }
}

export default async function SchoolPage({ params }: PageProps) {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) notFound()
  const promotion = await getPublicPromotion({ placement: 'school_page', schoolId: school.id })
  const [growth, launch] = await Promise.all([getSchoolGrowth(school.id), getPublicAccountLaunchState()])
  let isMember = false
  let peopleAccess = false
  try {
    const auth = await getAuthenticatedServerContext()
    if (auth) {
      const { data } = await auth.client.from('profile_school_memberships').select('id').eq('owner_user_id', auth.user.id).eq('school_id', school.id).limit(1)
      isMember = Boolean(data?.length)
      peopleAccess = !launch.emergencyStopped && await hasBetaFeatureAccess(auth.client, auth.user.id, 'people_search')
    }
  } catch { /* Public school information stays available without a session. */ }
  const snapshot = growth.schools[0]

  return (
    <main className="growth-journey sl-game sl-hub mx-auto w-full max-w-7xl space-y-5 px-5 pb-8 sm:px-8">
      <GrowthReferralLanding />
      <GameHeader />
      <nav className="flex items-center gap-1 text-xs text-gray-400">
        <Link href="/" className="hover:text-gray-600">홈</Link>
        <ChevronRight size={12} />
        <Link href="/search" className="hover:text-gray-600">학교 검색</Link>
        <ChevronRight size={12} />
        <span className="font-medium text-gray-600">{school.school_name}</span>
      </nav>

      <div className="sl-hub-board">
      <div className="sl-hub-world"><SchoolWorld level={snapshot?.level} priority /><p>추억이 모여, 하나의 작은 세계가 돼요.</p><span className="sl-symbolic-caption">SchoolLove의 상징적인 학교 모습이에요.</span></div>
      <section className="sl-hub-status">
        <p className="text-xs font-bold tracking-[0.14em] text-[var(--schoollove-game-accent)]">OUR SCHOOL, NEXT LEVEL</p>
        <h1 className="mt-3 text-2xl font-bold text-schoollove-text sm:text-3xl">{school.school_name}</h1>
        <p className="mt-3 flex items-center gap-1.5 text-sm text-schoollove-secondary">
          <MapPin size={14} aria-hidden="true" />
          <span>{school.sido}</span> {school.sigungu} · {SCHOOL_TYPE_LABELS[school.school_type]}
        </p>
        {snapshot ? <GrowthMeter growth={snapshot} /> : <p role="status" className="mt-5 text-base">학교 레벨 정보를 잠시 불러오지 못했어요.</p>}
        {snapshot?.rank && <p className="mt-4 text-base font-semibold">이번 주 XP {snapshot.rank}위</p>}
        {snapshot?.lastLevelUp && <p className="mt-2 text-sm">최근 공개 레벨업 · {new Date(snapshot.lastLevelUp).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>}
      </section>

      <section className="sl-hub-join" aria-labelledby="private-account-cta">
        <h2 id="private-account-cta" className="text-lg font-bold text-schoollove-text">{isMember ? '우리 학교, 함께 키워요' : '내 학교로 등록하고 키우기'}</h2>
        <p className="mt-2 text-sm leading-6 text-schoollove-secondary">
          첫 학교 등록으로 학교 XP를 모아요. 개인 이름·졸업연도·학년·반은 공개 명단으로 표시하지 않아요.
        </p>
        <div className="mt-5">{isMember && snapshot ? <GrowthShareButton schoolId={school.id} schoolName={school.school_name} slug={school.slug} /> : launch.state === 'open' ? <SchoolJoinButton slug={school.slug} /> : <p className="text-sm">신규 계정 시작은 현재 준비 중입니다.</p>}</div>
        {isMember && <Link href="/account#my-schools-heading" className="schoollove-focus mt-3 inline-flex min-h-11 items-center text-sm underline">내 학교의 최신 레벨 확인</Link>}
        {peopleAccess && <Link href="/people/search" className="schoollove-focus mt-4 inline-flex min-h-11 items-center text-sm underline">기억나는 사람 찾아보기</Link>}
        <p className="mt-4 text-sm leading-6">학교 레벨과 사람 찾기 이용 권한은 별개예요. 친구 링크를 받아도 사람 찾기 이용 승인은 별도로 필요해요.</p>
      </section>
      </div>
      <GrowthHowItWorks />
      {promotion ? <TodayInstagramCard promotion={promotion} /> : null}
    </main>
  )
}
