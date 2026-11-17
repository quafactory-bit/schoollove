'use client'

import './globals.css'
import AppErrorRecovery from '@/components/AppErrorRecovery'

// 루트 레이아웃까지 깨졌을 때의 마지막 오류 경계. 자체 html/body가 필요하다.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <AppErrorRecovery error={error} reset={reset} />
      </body>
    </html>
  )
}
