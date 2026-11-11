import { SchoolFunnelView } from '@/components/FunnelTracker'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getPublicRouteRobots } from '@/lib/policy/privacySafety'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { getPublicAccountLaunchState } from '@/lib/publicAccountLaunch'
import { getSchoolYearCounts, parseGraduationYearParam } from '@/lib/schoolYearCounts'
import { buildYearPath } from '@/lib/seo'
import { shortSchoolName } from '@/lib/push/contracts'
import PageNav from '@/components/PageNav'
import SchoolActionButton, { type SchoolActionMode } from '@/components/SchoolActionButton'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string; year: string }>
}

// 링크 미리보기: og:title에 공개 등록 수만 넣는다(이름 없음). og:url은 canonical과 같은 값.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, year: yearParam } = await params
  const school = await getSchoolBySlug(slug)
  const year = parseGraduationYearParam(yearParam)
  if (!school || year === null) return { title: '졸업연도 출석부', robots: getPublicRouteRobots('year') }
  const counts = await getSchoolYearCounts(school.id)
  const count = counts.years.find((row) => row.graduationYear === year)?.count ?? 0
  const url = buildYearPath(school.slug, year)
  return {
    title: '졸업연도 출석부',
    alternates: { canonical: url },
    openGraph: { title: `${shortSchoolName(school.school_name)} ${year}년 졸업 출석부 · ${count}명`, url, siteName: '출석부', locale: 'ko_KR', type: 'website' },
    robots: getPublicRouteRobots('year'),
  }
}

// v2-04: 로그아웃 상태의 연도 페이지는 등록 수와 이름 없는 흐린 자리만 보여 준다. 로그인 후 명단은 06번.
const PLACEHOLDER_LIMIT = 6

export default async function YearPage({ params }: PageProps) {
  const { slug, year: yearParam } = await params
  const school = await getSchoolBySlug(slug)
  const year = parseGraduationYearParam(yearParam)
  if (!school || year === null) notFound()

  const [counts, launch] = await Promise.all([getSchoolYearCounts(school.id), getPublicAccountLaunchState()])
  const count = counts.years.find((row) => row.graduationYear === year)?.count ?? 0
  let mode: SchoolActionMode = 'start'
  try {
    const auth = await getAuthenticatedServerContext()
    if (auth) {
      const { data } = await auth.client.from('profile_school_memberships').select('id').eq('owner_user_id', auth.user.id).eq('school_id', school.id).limit(1)
      mode = data?.length ? 'roster' : 'register'
    }
  } catch { /* Public counts stay available without a session. */ }

  return (
    <main className="mx-auto w-full max-w-content bg-white pb-6">
      <SchoolFunnelView schoolId={school.id} />
      <PageNav title="출석부" />
      <div className="px-4 pt-2">
        <p className="mb-1.5 text-[13px] font-semibold text-sl-ink3">{school.school_name} · {SCHOOL_TYPE_LABELS[school.school_type]}</p>
        <h1 className="text-[28px] font-black leading-[1.15] tracking-[-0.6px] text-sl-ink">{year}년 졸업 · {count > 0 ? <span className="text-sl-brand">{count}명</span> : '아직 없음'}</h1>
        <p className="mt-2 text-[15px] leading-[1.45] text-sl-ink2">{count > 0 ? '같은 학교 회원이 되면 이름을 확인할 수 있어요.' : '이 기수의 첫 번째 동문이 되어 주세요.'}</p>
        {count > 0 ? <ul className="mt-4 flex flex-wrap gap-3" aria-label="이름은 회원에게만 보여요">
          {Array.from({ length: Math.min(count, PLACEHOLDER_LIMIT) }, (_, index) => (
            <li key={index} aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-sl-bg2 text-lg font-black text-sl-ink3 blur-[0.5px]">?</li>
          ))}
        </ul> : null}
        {mode === 'start' && launch.state !== 'open'
          ? <p role="status" className="mt-3.5 rounded-[14px] bg-sl-bg2 px-4 py-3 text-sm text-sl-ink2">신규 계정 시작은 현재 준비 중입니다.</p>
          : <SchoolActionButton mode={mode} slug={school.slug} />}
        <p className="mt-3 text-center text-[12.5px] font-medium leading-[1.55] text-sl-ink3">이름·졸업연도는 같은 학교 회원에게만 보여요. 인스타 주소는 서로 수락할 때만. 만 19세 이상.</p>
      </div>
    </main>
  )
}
