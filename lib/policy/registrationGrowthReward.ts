import type { RegistrationGrowthOutcome, RegistrationGrowthSnapshot } from '@/types/registration'

// PHASE 6A — 등록으로 인한 학교 성장 before/after 스냅샷을 비교해 결과를 분류한다.
// 순수 함수 — DB 접근 없음, 레벨 계산 공식을 복제하지 않고 이미 계산된 스냅샷(전달받은
// 값)만 비교한다. lib/policy/levelPersistence.ts(FROZEN)는 손대지 않고 이 별도 파일에 둔다.
//
// 우선순위: level_up > first_record > progress > no_change.
// level_up과 first_record가 동시에 참일 수 있는 드문 경우(저장 레벨이 계산값보다 높게
// 고정된 경우, lib/policy/schoolGrowth.ts의 "드문 경우" 분기 참고)에는 더 희소한
// 이벤트인 level_up을 우선한다.
export function classifyRegistrationGrowthOutcome(
  before: RegistrationGrowthSnapshot,
  after: RegistrationGrowthSnapshot
): RegistrationGrowthOutcome {
  if (after.effectiveLevel > before.effectiveLevel) return 'level_up'
  if (before.visibleProfileCount === 0 && after.visibleProfileCount > 0) return 'first_record'
  if (after.visibleProfileCount > before.visibleProfileCount) return 'progress'
  return 'no_change'
}
