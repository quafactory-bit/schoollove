import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { hasPublicAccountAccessActive } from '@/lib/publicAccountLaunch'
import ConnectionsClient from '@/app/connections/ConnectionsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '알림', robots: { index: false, follow: false, nocache: true, noarchive: true } }

// v2-06: 알림 탭 = 서로 수락한 친구 + 기다리는 요청(기존 연결 화면을 그대로 쓰고, /connections는 여기로 리다이렉트).
export default async function NotificationsPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/notifications')
  const [searchAccess, accountAccess] = await Promise.all([
    hasBetaFeatureAccess(auth.client, auth.user.id, 'people_search').catch(() => false),
    hasPublicAccountAccessActive(auth.client, auth.user.id).catch(() => false),
  ])
  return <ConnectionsClient peopleSearchEnabled={searchAccess && accountAccess} />
}
