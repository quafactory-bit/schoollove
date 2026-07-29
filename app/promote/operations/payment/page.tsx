import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAccountState } from '@/lib/account'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import PaymentCheckoutClient from './PaymentCheckoutClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '광고 결제', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default async function PaymentCheckoutPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/promote/operations/payment')

  const account = await getAccountState(auth.client, auth.user.id)
  if (!account.adultEligible || !account.consentsComplete) redirect('/account')

  return <PaymentCheckoutClient />
}
