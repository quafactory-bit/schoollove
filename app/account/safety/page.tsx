import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '내 안전 설정', robots: { index: false, follow: false, nocache: true, noarchive: true } }

export default async function AccountSafetyPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login')
  return <main className="mx-auto max-w-2xl px-5 py-10"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Account safety</p><h1 className="mt-2 text-3xl font-bold">내 안전 설정</h1><div className="mt-7 space-y-4"><section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="font-bold">연결 기능 비활성</h2><p className="mt-2 text-sm leading-6 text-gray-600">공개 계정 소프트런치에서는 사람 검색·연결·메시지·Instagram 공개를 제공하지 않습니다. 그러므로 일반 사용자에게 연결 대상이나 차단 목록을 노출하지 않습니다.</p></section><section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="font-bold">계정 탈퇴</h2><p className="mt-2 text-sm leading-6 text-gray-600">내 계정에서 탈퇴를 요청할 수 있으며, 처리 완료 후 Auth identity는 재가입을 막는 장기 차단 tombstone으로 보존됩니다. 기존 legacy 등록자나 공개 프로필의 소유권을 부여하지 않습니다.</p><Link href="/account" className="mt-4 inline-block text-sm font-semibold text-red-700">내 계정으로 이동</Link></section></div></main>
}
