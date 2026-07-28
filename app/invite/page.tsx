import type { Metadata } from 'next'
import Link from 'next/link'
import PrivacyTransitionNotice from '@/components/PrivacyTransitionNotice'
import { PRIVATE_ROUTE_ROBOTS } from '@/lib/policy/privacySafety'

export const metadata: Metadata = {
  title: '공유 기능 중단 안내',
  description: '개인정보 안전 전환 중에는 개인 등록을 유도하는 초대 기능을 제공하지 않습니다.',
  robots: PRIVATE_ROUTE_ROBOTS,
}

export default function InvitePage() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-12">
      <PrivacyTransitionNotice title="초대 기능을 잠시 중단했습니다" />
      <p className="mt-5 text-sm leading-6 text-gray-600">
        개인정보 안전 전환이 완료될 때까지 개인 등록을 유도하는 초대 링크와 공유 문구를 제공하지 않습니다.
      </p>
      <Link href="/search" className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-gray-900 px-5 font-semibold text-white">
        학교 기본 정보 검색하기
      </Link>
    </main>
  )
}
