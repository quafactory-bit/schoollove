// Home Growth Feed v2 (Phase 3A) — docs/decisions/2026-07-17-home-growth-feed-v2.md
// Home 활동 피드가 사용하는 최소 데이터 계약. 개인 식별 필드(nickname/instagram_id)는
// 이 타입에 존재하지 않는다 — lib/api 레이어에서 애초에 select하지 않는다.

// 활동 조회 시 join으로 함께 가져오는 최소 학교 정보. School Hub와 동일하게
// current_level은 "현재 상태 배지"로만 쓰고 XP curve 값(remainingToNext 등)은 포함하지 않는다.
export type HomeActivitySchoolRef = {
  schoolName: string
  slug: string
  currentLevel: number | null
}

export type RecentRegisterActivity = {
  id: string
  createdAt: string
  graduationYear: number | null
  school: HomeActivitySchoolRef | null
}

export type RecentTraceActivity = {
  id: string
  createdAt: string
  message: string
  school: HomeActivitySchoolRef | null
}

export type HomeActivityType = 'register' | 'trace'

// register/trace를 병합·정렬한 뒤 화면이 그대로 렌더링하는 정규화된 피드 항목.
// text는 이미 완성된 문장이다(컴포넌트는 문구를 다시 조합하지 않는다).
export type HomeActivityItem = {
  id: string
  type: HomeActivityType
  createdAt: string
  text: string
  schoolName: string
  slug: string
  currentLevel: number | null
}

// "이번 주 학교 성장 순위" 한 행 — GrowthRankingRow(types/ranking.ts)에 School Hub의
// 사람 수 성장 helper(calculatePeopleGrowthStage) 결과를 합쳐 화면이 바로 쓸 수 있게 만든 뷰.
export type WeeklyRankingViewRow = {
  rank: number
  schoolId: string
  schoolName: string
  slug: string
  newVisibleProfiles: number
  visibleProfileCount: number
  currentLevel: number | null
  // State C(다음 목표 없음)면 null — 화면은 이 경우 "활발하게 이어지는 학교" 문구로 대체한다.
  remainingLabel: string | null
  progressPercent: number
  isNearGrowth: boolean
  isComplete: boolean
}
