'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveSchoolIntent } from '@/lib/policy/schoolJourney'

export type SchoolActionMode = 'start' | 'register' | 'roster'

// v2-04: 학교·연도 페이지의 주 버튼. 로그아웃 → Google로 시작, 로그인·미등록 → 등록, 등록됨 → 내 출석부.
// 학교 선택은 기존 학교 intent(sessionStorage)로 넘겨 로그인·계정 화면이 이어받게 한다.
export default function SchoolActionButton({ mode, slug }: { mode: SchoolActionMode; slug: string }) {
  const router = useRouter()
  const [unavailable, setUnavailable] = useState(false)
  if (mode === 'roster') return <Link href="/account" className="btn-primary schoollove-focus mt-3.5 w-full">내 출석부 보기</Link>

  const href = mode === 'start' ? `/login?next=${encodeURIComponent(`/school/${slug}`)}` : '/account'
  return (
    <div className="mt-3.5">
      <button
        type="button"
        className="btn-primary schoollove-focus w-full"
        onClick={() => {
          if (!saveSchoolIntent(slug)) setUnavailable(true)
          router.push(href)
        }}
      >
        {mode === 'start' ? <><GoogleBadge />Google로 시작하고 출석부 보기</> : '이 학교 등록하기'}
      </button>
      {unavailable ? <p role="status" className="mt-2 text-xs leading-5 text-sl-ink2">이 탭에 학교 선택을 보관할 수 없어요. 로그인 뒤 학교를 직접 검색해 주세요.</p> : null}
    </div>
  )
}

function GoogleBadge() {
  return <span aria-hidden="true" className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white font-[Arial,sans-serif] text-[13px] font-black text-[#4285f4]">G</span>
}
