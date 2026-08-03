import type { Metadata } from 'next'
import SchoolSearchResults from '@/components/SchoolSearchResults'
import { getPublicRouteRobots } from '@/lib/policy/privacySafety'
import { recordPublicAccountEvent } from '@/lib/publicAccountLaunch'

export const dynamic='force-dynamic'

export const metadata: Metadata = {
  title: '학교 검색',
  description: '개인 정보 없이 학교명·지역·학교 유형 등 학교 기본 정보만 검색합니다.',
  robots: getPublicRouteRobots('search'),
}

export default async function SearchPage() {
  await recordPublicAccountEvent('school_search_started','school_search')
  return (
    <main className="min-h-screen bg-gray-50">
      <SchoolSearchResults />
    </main>
  )
}
