import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { getAccountState } from '@/lib/account'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { getPromotionOperationsOwnerState } from '@/lib/promotionOperations'
import PromotionOperationsClient from './PromotionOperationsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '내 프로모션 운영', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default async function PromotionOperationsPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/promote/operations')
  const account = await getAccountState(auth.client, auth.user.id)
  if (!account.adultEligible || !account.consentsComplete) redirect('/account')
  if (!(await hasBetaFeatureAccess(auth.client, auth.user.id, 'promotion_operations'))) redirect('/account')
  const state = await getPromotionOperationsOwnerState(auth.user.id)
  return <PromotionOperationsClient initialState={state ?? { products: [], quotes: [], orders: [], reports: [], notifications: [] }} />
}
