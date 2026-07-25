'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { IMG } from '@/lib/images'

const SITE_URL = 'https://www.schoollove.kr'
const SHARE_TEXT = '학교 동창들 인스타 모으는 곳 - 스쿨러브아이. 너도 와서 이름 남겨봐!'

export default function InvitePage() {
  const [copied, setCopied] = useState(false)

  // 공유 링크 (추후 초대 코드 붙이려면 여기만 바꾸면 됨)
  const inviteUrl = SITE_URL

  function copyLink() {
    navigator.clipboard
      ?.writeText(inviteUrl)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  // 카카오/일반 공유: navigator.share 있으면 시트 호출, 없으면 링크 복사로 폴백
  function shareNative() {
    if (typeof navigator !== 'undefined' && (navigator as Navigator).share) {
      ;(navigator as Navigator)
        .share({ title: '스쿨러브아이', text: SHARE_TEXT, url: inviteUrl })
        .catch(() => {})
    } else {
      copyLink()
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-28 pt-10">
      <div className="mx-auto mb-6 w-full max-w-xs">
        <Image src={IMG.completeSchool} alt="" width={1536} height={1024} className="h-auto w-full" />
      </div>

      <h1 className="text-center text-2xl font-bold leading-tight text-neutral-900">
        함께 모일수록
        <br />
        연결될 확률이 높아져요
      </h1>
      <p className="mt-3 text-center text-sm text-neutral-500">
        친구에게 스쿨러브아이를 공유해보세요.
        <br />
        한 명이 오면, 그 학교가 살아나요.
      </p>

      {/* 초대 링크 */}
      <section className="mt-9">
        <label className="mb-2 block text-sm font-semibold text-neutral-800">초대 링크</label>
        <div className="flex gap-2">
          <input
            value={inviteUrl}
            readOnly
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3.5 text-sm text-neutral-600 outline-none"
          />
          <button
            onClick={copyLink}
            className="shrink-0 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white transition active:scale-95"
          >
            {copied ? '복사됨' : '복사'}
          </button>
        </div>
      </section>

      {/* 공유 버튼 */}
      <section className="mt-8 space-y-2.5">
        <button
          onClick={shareNative}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-5 py-4 text-sm font-semibold text-[#3A1D1D] transition active:scale-95"
        >
          카카오톡으로 공유하기
        </button>
        <button
          onClick={shareNative}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 active:scale-95"
        >
          다른 앱으로 공유하기
        </button>
      </section>

      <div className="mt-8 rounded-xl bg-blue-50 px-5 py-4 text-center">
        <p className="text-sm text-neutral-600">
          우리 학교 사람들,
          <br />
          <b className="text-blue-600">같이 모으고 다시 연결돼요.</b>
        </p>
      </div>

      <p className="mt-6 text-center">
        <Link href="/submit" className="text-sm font-medium text-neutral-500 underline underline-offset-4 hover:text-blue-600">
          먼저 이름부터 남기러 가기
        </Link>
      </p>
    </main>
  )
}
