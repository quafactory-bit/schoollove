import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { getAccountState } from '@/lib/account'
import AccountClient from './AccountClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '내 계정',
  description: '성인 본인 인증과 기본 비공개 프로필을 관리합니다.',
  robots: { index: false, follow: false, nocache: true },
}

export default async function AccountPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login')

  const state = await getAccountState(auth.client, auth.user.id)
  return <AccountClient email={auth.user.email ?? ''} state={state} />
}
