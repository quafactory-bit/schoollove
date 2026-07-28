import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import PeopleSearchClient from './PeopleSearchClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '정확한 사람 찾기',
  description: '기억하는 학교, 졸업연도와 정확한 이름으로 비공개 연결을 요청합니다.',
  robots: { index: false, follow: false, nocache: true },
}

export default async function PeopleSearchPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login')
  return <PeopleSearchClient />
}
