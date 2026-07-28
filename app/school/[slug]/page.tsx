import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getSchoolPageMetadata } from '@/lib/seo'
import { getPublicRouteRobots } from '@/lib/policy/privacySafety'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import PrivacyTransitionNotice from '@/components/PrivacyTransitionNotice'
import TodayInstagramCard from '@/components/TodayInstagramCard'
import { getPublicPromotion } from '@/lib/promotions'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return { title: '학교를 찾을 수 없습니다', robots: getPublicRouteRobots('year') }

  return {
    ...getSchoolPageMetadata(school),
    robots: getPublicRouteRobots('school'),
  }
}

export default async function SchoolPage({ params }: PageProps) {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) notFound()
  const promotion = await getPublicPromotion({ placement: 'school_page', schoolId: school.id })

  return (
    <main className="page-container space-y-5">
      <nav className="flex items-center gap-1 text-xs text-gray-400">
        <Link href="/" className="hover:text-gray-600">홈</Link>
        <ChevronRight size={12} />
        <Link href="/search" className="hover:text-gray-600">학교 검색</Link>
        <ChevronRight size={12} />
        <span className="font-medium text-gray-600">{school.school_name}</span>
      </nav>

      <section className="border border-schoollove-border bg-schoollove-surface p-6 sm:p-8">
        <p className="schoollove-hud-label text-[12px] tracking-[0.14em]">SCHOOL INFORMATION</p>
        <h1 className="mt-3 text-2xl font-bold text-schoollove-text sm:text-3xl">{school.school_name}</h1>
        <p className="mt-3 flex items-center gap-1.5 text-sm text-schoollove-secondary">
          <MapPin size={14} aria-hidden="true" />
          <span>{school.sido}</span> {school.sigungu} · {SCHOOL_TYPE_LABELS[school.school_type]}
        </p>
      </section>

      <PrivacyTransitionNotice schoolName={school.school_name} />
      {promotion ? <TodayInstagramCard promotion={promotion} /> : null}
    </main>
  )
}
