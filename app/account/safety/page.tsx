import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedServerContext } from '@/lib/user-auth'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '내 안전 설정', robots: { index: false, follow: false, nocache: true } }

export default async function AccountSafetyPage() {
  const auth = await getAuthenticatedServerContext()
  if (!auth) redirect('/login')
  return <main className="mx-auto max-w-2xl px-5 py-10"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Account safety</p><h1 className="mt-2 text-3xl font-bold">내 안전 설정</h1><div className="mt-7 space-y-4"><section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="font-bold">연결과 차단</h2><p className="mt-2 text-sm leading-6 text-gray-600">차단 또는 신고하면 상대의 재요청과 메시지가 즉시 중단되고 Instagram 공개도 자동 취소됩니다. 안전을 위해 차단 목록에서 직접 해제하는 기능은 PHASE 10C에 제공하지 않습니다.</p><Link href="/connections" className="mt-4 inline-block rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white">연결과 안부 확인</Link></section><section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="font-bold">계정 삭제</h2><p className="mt-2 text-sm leading-6 text-gray-600">내 계정에서 탈퇴를 요청할 수 있습니다. 실제 인증 계정 삭제는 관리자 검토 뒤 처리되며 자동으로 기존 공개 프로필의 소유권을 부여하지 않습니다.</p><Link href="/account" className="mt-4 inline-block text-sm font-semibold text-red-700">내 계정으로 이동</Link></section></div></main>
}
