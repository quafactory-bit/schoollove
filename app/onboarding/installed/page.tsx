import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'
import InstallScreen from './InstallScreen'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '홈 화면에 추가', robots: { index: false, follow: false, nocache: true, noarchive: true } }

// v2-08: 가입 완료 직후 한 번만 보여 주는 "홈 화면에 추가" 안내(목업 3번). 다시 보기는 계정 설정의 링크로만.
export default async function InstalledPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login?next=/account')
  const { again } = await searchParams
  return <InstallScreen again={again === '1'} />
}
