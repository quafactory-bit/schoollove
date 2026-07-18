// PHASE 6A — 등록 후 성장 보상(growthReward) 데이터 계약.
// docs/decisions/2026-07-14-register-flow-level-connection-phase0.md §Failure semantics
// "대안"(그때는 미채택)에서 다루던 { data, error } 밖 응답 필드 확장을, 이 Phase에서
// 선택적(optional) 필드로 도입한다. schoolName/slug는 포함하지 않는다 —
// app/submit/page.tsx가 이미 school 상태(SchoolLite)로 갖고 있어 서버가 다시 보낼 필요가 없다.
// isMaxLevel은 포함하지 않는다 — lib/policy/levelPolicy.ts의 레벨 곡선에는 상한이 없다
// (remainingToNext는 항상 1 이상).
export type RegistrationGrowthSnapshot = {
  visibleProfileCount: number
  effectiveLevel: number
  nextLevel: number
  remainingToNext: number
  progressPercent: number
  isNearLevelUp: boolean
}

export type RegistrationGrowthOutcome = 'first_record' | 'level_up' | 'progress' | 'no_change'

export type RegistrationGrowthReward = {
  schoolId: string
  before: RegistrationGrowthSnapshot
  after: RegistrationGrowthSnapshot
  outcome: RegistrationGrowthOutcome
}
