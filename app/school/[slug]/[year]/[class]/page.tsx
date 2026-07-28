import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getPublicRouteRobots } from '@/lib/policy/privacySafety'
import PrivacyTransitionNotice from '@/components/PrivacyTransitionNotice'

interface PageProps {
  params: Promise<{ slug: string; year: string; class: string }>
}

export const metadata: Metadata = {
  title: '개인 명단 비공개 안내',
  robots: getPublicRouteRobots('class'),
}

export default async function ClassPage({ params }: PageProps) {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) notFound()

  return (
    <main className="page-container space-y-5">
      <nav className="flex items-center gap-1 text-xs text-gray-400">
        <Link href="/">홈</Link>
        <ChevronRight size={12} />
        <Link href={`/school/${slug}`}>{school.school_name}</Link>
        <ChevronRight size={12} />
        <span className="font-medium text-gray-600">개인 명단 비공개</span>
      </nav>
      <PrivacyTransitionNotice schoolName={school.school_name} />
    </main>
  )
}
