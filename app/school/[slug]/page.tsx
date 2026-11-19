import { SchoolFunnelView } from '@/components/FunnelTracker'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Share } from 'lucide-react'
import YearChips from '@/components/part2/YearChips'
import { getSchoolBySlug } from '@/lib/api/schools'
import { buildSchoolPath, getSchoolPageMetadata } from '@/lib/seo'
import { getPublicRouteRobots } from '@/lib/policy/privacySafety'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { getPublicAccountLaunchState } from '@/lib/publicAccountLaunch'
import { getSchoolRoster, type SchoolRosterEntry } from '@/lib/schoolRoster'
import { formatGradeClassHistory } from '@/lib/accountGradeClass'
import { getSchoolYearCounts } from '@/lib/schoolYearCounts'
import PageNav from '@/components/PageNav'
import ShareButton from '@/components/ShareButton'
import HowItWorksStrip from '@/components/HowItWorksStrip'
import SchoolActionButton, { type SchoolActionMode } from '@/components/SchoolActionButton'
import Avatar from '@/components/Avatar'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return { title: '학교를 찾을 수 없습니다', robots: getPublicRouteRobots('year') }

  const description = `${school.school_name} 졸업연도별 등록 수를 확인하고, 같은 기수 출석부에서 옛 친구를 찾아보세요. 이름·졸업연도는 같은 학교 회원에게만 보여요.`
  return {
    ...getSchoolPageMetadata(school),
    title: `${school.school_name} · 졸업연도별 출석부`,
    description,
    openGraph: { title: `${school.school_name} · 졸업연도별 출석부`, description, url: buildSchoolPath(school.slug), siteName: '출석부', locale: 'ko_KR', type: 'website' },
    twitter: { card: 'summary_large_image', title: `${school.school_name} · 졸업연도별 출석부`, description },
    robots: getPublicRouteRobots('school'),
  }
}

export default async function SchoolPage({ params }: PageProps) {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) notFound()
  const [counts, launch] = await Promise.all([getSchoolYearCounts(school.id), getPublicAccountLaunchState()])
  let signedIn = false
  let isMember = false
  let rosterStatus: 'ok' | 'unavailable' | 'signed_out' = 'signed_out'
  let roster: SchoolRosterEntry[] = []
  try {
    const auth = await getAuthenticatedServerContext()
    if (auth) {
      signedIn = true
      const { data } = await auth.client.from('profile_school_memberships').select('id').eq('owner_user_id', auth.user.id).eq('school_id', school.id).limit(1)
      isMember = Boolean(data?.length)
      if (isMember) {
        const result = await getSchoolRoster(auth.client, school.id)
        rosterStatus = result.status
        roster = result.entries
      }
    }
  } catch { /* Public school information stays available without a session. */ }
  const mode: SchoolActionMode = isMember ? 'roster' : signedIn ? 'register' : 'start'
  const schoolHref = `/school/${encodeURIComponent(school.slug)}`

  return (
    <main className="mx-auto w-full max-w-content bg-white pb-6">
      <SchoolFunnelView schoolId={school.id} />
      <PageNav
        title="학교"
        right={<ShareButton schoolName={school.school_name} url={schoolHref} ariaLabel="학교 공유하기" label={<Share className="h-[22px] w-[22px]" aria-hidden="true" />} className="schoollove-focus inline-flex h-10 w-10 items-center justify-center rounded-full text-sl-ink" />}
      />
      <div className="px-4 pt-2">
        <p className="mb-1.5 text-[13px] font-semibold text-sl-ink3"><span>{school.sido}</span> {school.sigungu} · {SCHOOL_TYPE_LABELS[school.school_type]}</p>
        <h1 className="break-keep text-[28px] font-black leading-[1.15] tracking-[-0.6px] text-sl-ink">{school.school_name}</h1>
        <p className="mt-2 text-[15px] leading-[1.45] text-sl-ink2">
          {counts.total > 0
            ? <><b className="font-extrabold text-sl-ink">{counts.total}명</b>이 출석했어요. 졸업연도를 고르면 같은 기수 출석부가 보여요.</>
            : '졸업연도를 고르면 우리 학년 출석부가 열려요.'}
        </p>
        <YearChips slug={school.slug} years={counts.years} currentYear={new Date().getFullYear()} />
        {counts.status === 'unavailable' ? <p role="status" className="mt-2 text-sm font-semibold text-sl-ink3">등록 수를 잠시 불러오지 못했어요.</p> : null}
        <HowItWorksStrip />

        {mode === 'start' && launch.state !== 'open'
          ? <p role="status" className="mt-3.5 rounded-[14px] bg-sl-bg2 px-4 py-3 text-sm text-sl-ink2">신규 계정 시작은 현재 준비 중입니다.</p>
          : <SchoolActionButton mode={mode} slug={school.slug} />}
        <p className="mt-3 text-center text-[12.5px] font-medium leading-[1.55] text-sl-ink3">이름·졸업연도는 같은 학교 회원에게만 보여요. 인스타 주소는 서로 수락할 때만. 만 19세 이상.</p>
      </div>

      {isMember ? <section className="mx-4 mt-6 rounded-2xl border border-sl-line px-3.5 py-1" aria-labelledby="school-roster-heading">
        <h2 id="school-roster-heading" className="pt-3 text-base font-extrabold text-sl-ink">현재 가입한 사람</h2>
        {rosterStatus === 'ok' ? roster.length > 0 ? <ul>
          {roster.map((entry, index) => <li key={`${entry.display_name}-${entry.graduation_year}-${index}`} className="flex min-h-16 items-center gap-3 border-b border-sl-line last:border-b-0">
            <Avatar name={entry.display_name} />
            <p className="flex-1 text-[16.5px] font-extrabold tracking-[-0.2px] text-sl-ink">{entry.display_name}
              <small className="mt-0.5 block text-[12.5px] font-semibold text-sl-ink3">{entry.graduation_year}년 졸업 · {entry.class_history.length > 0 ? formatGradeClassHistory(entry.class_history) : '등록한 반 없음'}</small>
            </p>
          </li>)}
        </ul> : <p className="py-3 text-sm text-sl-ink2">아직 명단 표시를 켠 가입자가 없습니다.</p>
        : <p className="py-3 text-sm leading-6 text-sl-ink2">내 계정에서 이 학교의 ‘학교에서 나를 표시하기’를 켜면 같은 학교 명단을 확인할 수 있습니다.</p>}
        <p className="pb-3 text-xs leading-5 text-sl-ink3">이 명단은 같은 학교에 등록하고 명단 표시를 켠 만 19세 이상 회원에게만 보입니다. 인스타그램주소·연락처·사진은 표시하지 않습니다.</p>
      </section> : null}
    </main>
  )
}
