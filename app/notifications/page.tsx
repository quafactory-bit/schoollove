import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import NotificationsClient from './NotificationsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '내 알림', robots: { index: false, follow: false, nocache: true, noarchive: true } }
export default async function NotificationsPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login')
  return <NotificationsClient />
}
