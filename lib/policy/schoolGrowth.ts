import { calculateLevelState } from './levelPolicy'
import type {
  SchoolGrowthSnapshot,
  SchoolGrowthSnapshotInput,
  SchoolState,
} from '@/types/schoolGrowth'

// docs/design-package-v1.0/03-level-policy.md §7 "remainingToNext <= 2이면 임박 상태" (확정값)
const NEAR_LEVEL_UP_THRESHOLD = 2

// docs/design-package-v1.0/03-level-policy.md §5 SchoolState 경계 (A/B/C 확정)
// State D(대표학교)는 여기 포함하지 않는다 — completion(§6) 계산식이 문서에 없어
// 임의로 구현하지 않는다(docs/decisions/2026-07-15-school-growth-foundation.md blocker 참고).
export function classifySchoolState(visibleProfileCount: number): SchoolState {
  if (visibleProfileCount <= 0) return 'A'
  if (visibleProfileCount <= 10) return 'B'
  return 'C'
}

// School Hub와 Home Growth Feed가 공통으로 쓰는 읽기 전용 성장 스냅샷 계산.
// 순수 함수 — DB를 읽거나 쓰지 않고, syncSchoolLevel을 호출하지 않는다.
// Level 공식은 재구현하지 않고 calculateLevelState()를 그대로 재사용한다.
export function calculateSchoolGrowthSnapshot(
  input: SchoolGrowthSnapshotInput
): SchoolGrowthSnapshot {
  const { schoolId, schoolName, slug, storedCurrentLevel, levelUpdatedAt } = input

  // calculateLevelState 자체도 음수/NaN을 0으로 clamp하지만, visibleProfileCount 필드에
  // 그 sanitize된 값을 그대로 반영하기 위해 여기서도 동일 기준으로 clamp한다.
  const visibleProfileCount =
    Number.isFinite(input.visibleProfileCount) && input.visibleProfileCount > 0
      ? input.visibleProfileCount
      : 0

  const calculatedState = calculateLevelState(visibleProfileCount)

  // current_level 저장값 우선(§8) — 저장값이 계산값보다 높을 때만 저장값을 그대로 사용한다.
  // 저장값이 null(미초기화)이거나 계산값 이하이면 계산값을 사용한다.
  // 이 함수는 저장값을 갱신하지 않는다 — 화면에 무엇을 보여줄지만 결정한다.
  const effectiveLevel =
    storedCurrentLevel !== null && storedCurrentLevel > calculatedState.level
      ? storedCurrentLevel
      : calculatedState.level

  const progressPercent =
    calculatedState.xpForNextLevel > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((calculatedState.xpIntoLevel / calculatedState.xpForNextLevel) * 100))
        )
      : 0

  return {
    schoolId,
    schoolName,
    slug,
    visibleProfileCount,
    storedCurrentLevel,
    calculatedLevel: calculatedState.level,
    effectiveLevel,
    nextLevel: calculatedState.level + 1,
    nextLevelThreshold: calculatedState.xpForNextLevel,
    remainingToNext: calculatedState.remainingToNext,
    progressPercent,
    isNearLevelUp: calculatedState.remainingToNext <= NEAR_LEVEL_UP_THRESHOLD,
    schoolState: classifySchoolState(visibleProfileCount),
    levelUpdatedAt,
  }
}
