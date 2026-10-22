'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

// v2: 페이지별 상단 네비(뒤로 · 제목 · 오른쪽 아이콘). 데스크톱도 600px 중앙 정렬.
export default function PageNav({ title, back = true, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  const router = useRouter()
  return (
    <div className="mx-auto flex h-12 max-w-content items-center justify-between px-4">
      <span className="flex w-10 justify-start">
        {back ? (
          <button type="button" aria-label="뒤로" onClick={() => router.back()} className="schoollove-focus inline-flex h-10 w-10 items-center justify-center rounded-full text-sl-ink">
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </button>
        ) : null}
      </span>
      <h1 className="text-[17px] font-extrabold tracking-[-0.2px] text-sl-ink">{title}</h1>
      <span className="flex w-10 justify-end">{right}</span>
    </div>
  )
}
