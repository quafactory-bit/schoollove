import type { GrowthRankingInput, GrowthRankingRow } from '@/types/ranking'

// docs/decisions/2026-07-15-school-growth-foundation.md 확정 정렬 기준
// 1. newVisibleProfiles 내림차순
// 2. 동률이면 mostRecentRegistrationAt 내림차순 (null은 값이 없으므로 가장 뒤로 보낸다)
// 3. 그래도 같으면 schoolName 오름차순(ko locale)
// 순수 함수 — DB에 접근하지 않는다. 실제 집계된 rows를 입력받아 정렬·순위 부여만 한다.
export function sortGrowthRanking<T extends GrowthRankingInput>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.newVisibleProfiles !== a.newVisibleProfiles) {
      return b.newVisibleProfiles - a.newVisibleProfiles
    }

    const aTime = a.mostRecentRegistrationAt ? new Date(a.mostRecentRegistrationAt).getTime() : -Infinity
    const bTime = b.mostRecentRegistrationAt ? new Date(b.mostRecentRegistrationAt).getTime() : -Infinity
    if (bTime !== aTime) return bTime - aTime

    return a.schoolName.localeCompare(b.schoolName, 'ko')
  })

  return sorted.map((row, i) => ({ ...row, rank: i + 1 }))
}

// "이번 주 학교 성장 순위" TOP N. 가짜 학교로 빈 자리를 채우지 않는다 —
// 실제 대상이 limit보다 적으면 그 수만큼만 반환한다. 대상이 0건이면 빈 배열을 반환하며,
// 이 경우 화면(School Hub Phase 1B)에서 빈 상태를 표시해야 한다(이 함수의 책임 아님).
export function topGrowthRanking<T extends GrowthRankingInput>(
  rows: T[],
  limit = 5
): (T & { rank: number })[] {
  return sortGrowthRanking(rows).slice(0, limit)
}

export type { GrowthRankingInput, GrowthRankingRow }
