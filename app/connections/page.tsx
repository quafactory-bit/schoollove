import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { hasPublicAccountAccessActive } from '@/lib/publicAccountLaunch'
import ConnectionsClient from './ConnectionsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '내 연결과 안부', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default async function ConnectionsPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/connections')
  const [searchAccess, accountAccess] = await Promise.all([
    hasBetaFeatureAccess(auth.client, auth.user.id, 'people_search').catch(() => false),
    hasPublicAccountAccessActive(auth.client, auth.user.id).catch(() => false),
  ])
  return <ConnectionsClient peopleSearchEnabled={searchAccess && accountAccess} />
}
