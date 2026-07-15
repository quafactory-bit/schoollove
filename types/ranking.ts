// docs/decisions/2026-07-15-school-growth-foundation.md — 주간/오늘 성장 순위 결과 계약.
// Home과 School Hub가 재사용한다. 실제 DB 집계(Section 4)는 별도 blocker로 분리되어 있으며,
// 이 타입과 정렬 로직(lib/policy/schoolRanking.ts)은 그 집계 결과를 받아 순수하게 정렬만 한다.
export type GrowthRankingInput = {
  schoolId: string
  schoolName: string
  slug: string
  // 기간 내 신규 공개 프로필 수(is_hidden=false). 가짜 값으로 채우지 않는다.
  newVisibleProfiles: number
  // 기간 내 가장 최근 등록 시각. 신규 등록이 없으면 null.
  mostRecentRegistrationAt: string | null
  // growth snapshot에 필요한 최소 Level 정보 — 저장값 우선 원칙을 그대로 따른다.
  currentLevel: number | null
  remainingToNext: number
}

export type GrowthRankingRow = GrowthRankingInput & {
  rank: number
}
