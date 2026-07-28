import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import ConversationClient from './ConversationClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '안전한 대화', robots: { index: false, follow: false, nocache: true, noarchive: true } }
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login')
  return <ConversationClient connectionId={(await params).id} />
}
