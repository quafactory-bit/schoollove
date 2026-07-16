// docs/decisions/2026-07-15-school-growth-foundation.md / 2026-07-15-school-growth-ranking-rpc.md
// 주간/오늘 성장 랭킹의 기간 시작 시각을 계산하는 순수 함수.
// 시스템 로컬 타임존에 의존하지 않는다 — 항상 UTC 기반 계산만 사용한다.
// Asia/Seoul(KST)은 UTC+9 고정이며 서머타임(DST)이 없어 상수 오프셋으로 안전하게 계산할 수 있다.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// "최근 7일" 시작 시각 = now로부터 정확히 7*24시간 이전.
export function getRecentWeekStart(now: Date): Date {
  return new Date(now.getTime() - SEVEN_DAYS_MS)
}

// Asia/Seoul(KST, UTC+9, DST 없음) 기준 "오늘 00:00"을 UTC Date로 반환한다.
// new Date().getFullYear() 등 로컬 타임존에 의존하는 API는 사용하지 않는다 —
// now를 KST로 shift한 뒤 UTC getter로 날짜만 읽고, 다시 KST 자정을 UTC로 환산한다.
export function getSeoulTodayStartUtc(now: Date): Date {
  const kstShifted = new Date(now.getTime() + KST_OFFSET_MS)
  const year = kstShifted.getUTCFullYear()
  const month = kstShifted.getUTCMonth()
  const day = kstShifted.getUTCDate()
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - KST_OFFSET_MS)
}
