'use client'

import { useEffect, useState } from 'react'
import { claimAutoReload, isChunkLoadError, recoverToHome } from '@/lib/clientRecovery'

// app/error.tsx와 app/global-error.tsx가 함께 쓰는 복구 화면.
// Next 기본 "Application error" 흰 화면 대신, 다시 시도·캐시 정리 후 홈·학교 찾기를 항상 보여 준다.
// 오류 내용(메시지·스택)은 화면에 보여 주지 않는다.
export default function AppErrorRecovery({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // 배포 직후 옛 청크 오류는 한 번만 자동으로 새로고침해 대부분 스스로 풀리게 한다.
    if (isChunkLoadError(error) && claimAutoReload()) {
      setBusy(true)
      void recoverToHome()
    }
  }, [error])

  const recover = () => {
    setBusy(true)
    void recoverToHome()
  }

  return (
    <main className="mx-auto w-full max-w-content bg-white px-4 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">🏫</p>
      <h1 className="mt-4 break-keep text-2xl font-black text-[#0a0a0a]">화면을 불러오지 못했어요</h1>
      <p className="mt-2 break-keep text-[15px] leading-[1.6] text-[#555]">
        잠깐 연결이 불안정했거나 예전 화면이 남아 있었어요. 아래 버튼을 누르면 새로 불러와요.
      </p>
      <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={recover}
          disabled={busy}
          className="min-h-12 rounded-xl bg-[#0f7b5f] px-4 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy ? '새로 불러오는 중…' : '새로고침하고 홈으로 가기'}
        </button>
        {reset ? (
          <button
            type="button"
            onClick={() => reset()}
            disabled={busy}
            className="min-h-12 rounded-xl border border-gray-300 px-4 text-[15px] font-bold text-[#0a0a0a]"
          >
            이 화면 다시 시도
          </button>
        ) : null}
        {/* Link 대신 a: 라우터 자체가 깨졌을 때도 전체 페이지로 이동한다. */}
        <a href="/search" className="min-h-12 rounded-xl px-4 py-3 text-[15px] font-bold text-[#0f7b5f] underline">
          학교 찾기로 가기
        </a>
      </div>
    </main>
  )
}
