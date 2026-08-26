import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { hasPublicAccountAccessActive } from '@/lib/publicAccountLaunch'
import PeopleSearchClient from './PeopleSearchClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '정확한 사람 찾기',
  description: '기억하는 학교, 졸업연도와 정확한 이름으로 비공개 연결을 요청합니다.',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
}

export default async function PeopleSearchPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/people/search')
  if (!await hasBetaFeatureAccess(auth.client,auth.user.id,'people_search')) redirect('/account')
  if (!await hasPublicAccountAccessActive(auth.client,auth.user.id)) redirect('/account')
  return <PeopleSearchClient />
}
