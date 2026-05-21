import type { Metadata } from 'next'
import SubmitForm from '@/components/SubmitForm'

export const metadata: Metadata = {
  title: '등록하기',
  description: '내 인스타그램을 학교 동창들이 찾을 수 있도록 등록하세요.',
  robots: { index: false },
}

export default function SubmitPage() {
  return (
    <div className="page-container max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">등록하기</h1>
        <p className="text-sm text-gray-500 mt-1">
          공개된 인스타그램 계정만 등록해주세요
        </p>
      </div>

      <SubmitForm />
    </div>
  )
}
