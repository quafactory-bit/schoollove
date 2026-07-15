// docs/design-package-v1.0/05-school-hub.md §2 / 03-level-policy.md §5 School State 경계.
// A/B/C는 등록 인원 기준으로 확정되어 있다.
// D(대표학교)는 completion(§6) 계산식이 FROZEN 문서에 없어 이 타입에 포함하지 않는다
// (docs/decisions/2026-07-15-school-growth-foundation.md blocker 참고).
export type SchoolState = 'A' | 'B' | 'C'

// getSchoolGrowthSnapshot 계산에 필요한 원시 입력.
// 호출자가 hidden profile을 이미 제외한 visibleProfileCount를 전달해야 한다
// (lib/api/profiles.ts::getSchoolProfileCount와 동일한 is_hidden=false 정의).
export type SchoolGrowthSnapshotInput = {
  schoolId: string
  schoolName: string
  slug: string
  visibleProfileCount: number
  storedCurrentLevel: number | null
  levelUpdatedAt: string | null
}

// School Hub와 Home Growth Feed가 공통으로 사용할 읽기 전용 성장 스냅샷 계약.
export type SchoolGrowthSnapshot = {
  schoolId: string
  schoolName: string
  slug: string
  visibleProfileCount: number
  // 저장된 값 그대로(03-level-policy.md §8) — null이면 미초기화 상태.
  storedCurrentLevel: number | null
  // visibleProfileCount를 cumulativeXp로 간주해 계산한 값(잠정 XP Source, §4).
  calculatedLevel: number
  // 화면에 표시할 최종 Level. storedCurrentLevel이 calculatedLevel보다 높으면
  // storedCurrentLevel을 그대로 사용한다(Level 하락 금지, §1/§8). 그 외에는 calculatedLevel.
  effectiveLevel: number
  // calculatedLevel 기준 다음 레벨 번호. remainingToNext/progressPercent/nextLevelThreshold와
  // 항상 같은 기준(calculatedLevel)을 사용해 서로 모순되지 않도록 한다.
  nextLevel: number
  // calculatedLevel 구간의 폭(LevelState.xpForNextLevel 그대로, 절대 임계값이 아님).
  nextLevelThreshold: number
  // LevelState.remainingToNext 그대로(항상 1 이상의 정수, §1).
  // State A의 "다음 레벨까지 1명" 표시(§7)는 이 값을 대체하지 않는 UI 카피 규칙이다 —
  // 화면 레이어(School Hub Phase 1B)에서 schoolState==='A'일 때만 별도로 적용한다.
  remainingToNext: number
  // 0~100 범위로 clamp된 현재 레벨 구간 내 진행률.
  progressPercent: number
  // remainingToNext <= 2 (03-level-policy.md §7 확정값).
  isNearLevelUp: boolean
  schoolState: SchoolState
  levelUpdatedAt: string | null
}
