import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import ConnectionsClient from '../ConnectionsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '받은 안부', robots: { index: false, follow: false, nocache: true } }
export default async function RequestsPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login')
  return <ConnectionsClient />
}
