'use client'

import AppErrorRecovery from '@/components/AppErrorRecovery'

// 라우트 단위 오류 경계: 레이아웃(하단 탭·푸터)은 유지하고 본문만 복구 화면으로 바꾼다.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppErrorRecovery error={error} reset={reset} />
}
