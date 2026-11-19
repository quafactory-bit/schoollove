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
import Chalkboard from '@/components/part2/Chalkboard'
import { getYearMaskedPreview } from '@/lib/part2Public'

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

// Part 2 P1: 로그아웃 상태에서 0명이면 칠판 선입력, 1명 이상이면 DB에서 가린 이름(김O수)만 보여 준다.

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
  const masked = count > 0 && mode === 'start' ? await getYearMaskedPreview(school.id, year) : []
  const canStart = launch.state === 'open'

  return (
    <main className="mx-auto w-full max-w-content bg-white pb-6">
      <SchoolFunnelView schoolId={school.id} />
      <PageNav title="출석부" />
      <div className="px-4 pt-2">
        <p className="mb-1.5 text-[13px] font-semibold text-sl-ink3">{school.school_name} · {SCHOOL_TYPE_LABELS[school.school_type]}</p>
        <h1 className="text-[28px] font-black leading-[1.15] tracking-[-0.6px] text-sl-ink">{year}년 졸업 · {count > 0 ? <span className="text-sl-brand">{count}명</span> : '아직 없음'}</h1>
        <p className="mt-2 text-[15px] leading-[1.45] text-sl-ink2">{count > 0 ? '같은 학교 회원이 되면 전체 이름을 확인할 수 있어요.' : '이 기수의 1대 반장(첫 출석자)을 기다리고 있어요.'}</p>
        {masked.length > 0 ? <ul className="mt-4 flex flex-wrap gap-2" aria-label="가린 이름 미리보기">
          {masked.map((name, index) => (
            <li key={`${name}-${index}`} className="inline-flex h-11 items-center rounded-full border border-[#16a34a]/40 bg-[#fcfaf5] px-4 text-[16px] font-extrabold tracking-[1px] text-[#14532d]">{name}</li>
          ))}
          {count > masked.length ? <li className="inline-flex h-11 items-center px-1 text-[14px] font-bold text-sl-ink3">외 {count - masked.length}명</li> : null}
        </ul> : null}
        {count === 0 && mode === 'start' ? <Chalkboard slug={school.slug} year={year} canStart={canStart} /> : null}
        {mode === 'start' && launch.state !== 'open'
          ? <p role="status" className="mt-3.5 rounded-[14px] bg-sl-bg2 px-4 py-3 text-sm text-sl-ink2">신규 계정 시작은 현재 준비 중입니다.</p>
          : <SchoolActionButton mode={mode} slug={school.slug} />}
        <p className="mt-3 text-center text-[12.5px] font-medium leading-[1.55] text-sl-ink3">로그인 전에는 가린 이름(김O수)만 보여요. 전체 이름은 같은 학교 회원에게만, 인스타 주소는 서로 수락할 때만. 만 19세 이상.</p>
      </div>
    </main>
  )
}
