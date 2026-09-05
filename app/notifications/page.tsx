import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { hasBetaFeatureAccess } from '@/lib/beta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '내 알림', robots: { index: false, follow: false, nocache: true, noarchive: true } }
export default async function NotificationsPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/notifications')
  if (!await hasBetaFeatureAccess(auth.client,auth.user.id,'connection_request')) redirect('/account')
  redirect('/connections')
}
