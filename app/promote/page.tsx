import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { getAccountState } from '@/lib/account'
import { getPromotionOwnerState } from '@/lib/promotions'
import PromoteClient from './PromoteClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '오늘의 Instagram 신청', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default async function PromotePage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/promote')
  const account = await getAccountState(auth.client, auth.user.id)
  if (!account.adultEligible || !account.consentsComplete) redirect('/account')
  const state = await getPromotionOwnerState(auth.user.id)
  return <PromoteClient initialState={state ?? { accounts: [], requests: [] }} />
}
