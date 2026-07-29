import type { Metadata } from 'next'
import OperationsClient from './OperationsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '제한 베타 운영 상태', robots: { index:false, follow:false, nocache:true, noarchive:true } }

export default function OperationsPage() {
  return <main className="mx-auto min-h-screen max-w-6xl bg-gray-50 px-6 py-10">
    <h1 className="text-3xl font-black">제한 베타 운영 상태</h1>
    <p className="mb-8 mt-2 text-gray-600">개인 원문 없이 접근·작업·내보내기·사고 상태만 표시합니다.</p>
    <OperationsClient />
  </main>
}
