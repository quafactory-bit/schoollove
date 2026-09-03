import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import { getAccountState } from '@/lib/account'
import AccountClient from './AccountClient'
import { getPublicAccountLaunchState } from '@/lib/publicAccountLaunch'
import { getKstCalendarDate } from '@/lib/policy/adultEligibility'
import { hasBetaFeatureAccess } from '@/lib/beta'
import { getBetaOnboardingState } from '@/lib/betaOnboarding'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '내 계정',
  description: '성인 본인 인증과 기본 비공개 프로필을 관리합니다.',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
}

export default async function AccountPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/account')

  let state:Awaited<ReturnType<typeof getAccountState>>
  let launch:Awaited<ReturnType<typeof getPublicAccountLaunchState>>
  let controlledBetaAccess:boolean
  let instagramBetaAccess:boolean
  let betaOnboardingState:Awaited<ReturnType<typeof getBetaOnboardingState>>
  try {
    ;[state,launch,controlledBetaAccess,instagramBetaAccess,betaOnboardingState]=await Promise.all([
      getAccountState(auth.client,auth.user.id),
      getPublicAccountLaunchState(auth.client),
      hasBetaFeatureAccess(auth.client,auth.user.id,'private_profile'),
      hasBetaFeatureAccess(auth.client,auth.user.id,'instagram_permission'),
      getBetaOnboardingState(auth.user.id),
    ])
  } catch {
    return <main className="mx-auto max-w-2xl px-5 py-16"><h1 className="text-2xl font-bold text-gray-950">내 계정 상태를 불러오지 못했습니다</h1><p className="mt-3 text-sm leading-6 text-gray-600">잠시 후 새로고침하거나 운영자 문의를 이용해 주세요. 안전을 위해 상태를 확인할 때까지 저장 기능을 제공하지 않습니다.</p></main>
  }
  return <AccountClient state={state} launch={launch} controlledBetaAccess={controlledBetaAccess} instagramBetaAccess={instagramBetaAccess} betaOnboardingState={betaOnboardingState} currentYear={getKstCalendarDate().year} />
}
