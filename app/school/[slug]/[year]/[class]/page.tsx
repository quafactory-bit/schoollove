import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublicRouteRobots } from '@/lib/policy/privacySafety'

interface PageProps {
  params: Promise<{ slug: string; year: string; class: string }>
}

export const metadata: Metadata = {
  title: '졸업연도 출석부',
  robots: getPublicRouteRobots('class'),
}

// v2-04: 반은 선택 입력이 되므로 반 페이지는 당분간 연도 페이지로 보낸다(URL 계층은 유지).
export default async function ClassPage({ params }: PageProps) {
  const { slug, year } = await params
  redirect(`/school/${encodeURIComponent(slug)}/${encodeURIComponent(year)}`)
}
