'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X } from 'lucide-react'

// 상단 띠배너: 클릭하면 홈으로 이동(검색 유도). X로 닫으면 그 세션 동안 숨김.
export default function WorldcupBanner() {
  const [closed, setClosed] = useState(false)

  if (closed) return null

  return (
    <div className="relative w-full">
      <Link href="/" aria-label="동창 찾기">
        <Image
          src="/worldcup-banner.png"
          alt="그때 같이 응원하던 그 친구, 지금 뭐 할까? 2026 함께 응원해요"
          width={2160}
          height={720}
          priority
          sizes="(max-width: 640px) 100vw, 48rem"
          className="h-auto w-full"
        />
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault()
          setClosed(true)
        }}
        aria-label="배너 닫기"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-white transition hover:bg-black/50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
