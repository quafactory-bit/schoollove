import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import OnboardingClient from './OnboardingClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '제한 베타 시작 안내',
  description: '만 19세 이상 승인 사용자를 위한 비공개 온보딩입니다.',
  robots: { index:false, follow:false, nocache:true, noarchive:true },
}

export default async function OnboardingPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/onboarding')
  return <OnboardingClient />
}
