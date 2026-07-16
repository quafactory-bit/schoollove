import { calculateLevelState, threshold } from './levelPolicy'
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

function clampProgress(xpIntoLevel: number, bracketWidth: number): number {
  if (bracketWidth <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((xpIntoLevel / bracketWidth) * 100)))
}

// School Hub와 Home Growth Feed가 공통으로 쓰는 읽기 전용 성장 스냅샷 계산.
// 순수 함수 — DB를 읽거나 쓰지 않고, syncSchoolLevel을 호출하지 않는다.
// Level 공식은 재구현하지 않고 calculateLevelState()/threshold()를 그대로 재사용한다.
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

  let nextLevel: number
  let nextLevelThreshold: number
  let remainingToNext: number
  let progressPercent: number

  if (effectiveLevel === calculatedState.level) {
    // 일반적인 경우: calculateLevelState 결과를 그대로 재사용한다(재계산하지 않음).
    nextLevel = calculatedState.level + 1
    nextLevelThreshold = calculatedState.xpForNextLevel
    remainingToNext = calculatedState.remainingToNext
    progressPercent = clampProgress(calculatedState.xpIntoLevel, calculatedState.xpForNextLevel)
  } else {
    // 드문 경우: storedCurrentLevel(effectiveLevel)이 calculatedState.level보다 높다
    // (예: 신고로 프로필이 숨김 처리되어 현재 visibleProfileCount가 과거보다 줄어든 경우).
    // Level 표시(effectiveLevel)는 내려가지 않지만, "다음 레벨까지"는 실제 현재 인원 기준으로
    // 다시 계산해야 정확하므로 threshold()를 effectiveLevel 기준으로 재사용한다.
    // (threshold 공식 자체는 복제하지 않고 levelPolicy.ts의 동일 함수를 그대로 호출한다.)
    const currentThreshold = threshold(effectiveLevel)
    const nextThreshold = threshold(effectiveLevel + 1)
    // visibleProfileCount는 정의상 currentThreshold보다 작다(그렇지 않다면 calculatedState.level이
    // 이미 effectiveLevel 이상이었을 것이다) — 진행률은 0으로, 남은 인원은 이 격차 전체로 계산한다.
    const xpIntoLevel = Math.max(0, visibleProfileCount - currentThreshold)

    nextLevel = effectiveLevel + 1
    nextLevelThreshold = nextThreshold - currentThreshold
    remainingToNext = Math.max(1, Math.ceil(nextThreshold - visibleProfileCount))
    progressPercent = clampProgress(xpIntoLevel, nextLevelThreshold)
  }

  return {
    schoolId,
    schoolName,
    slug,
    visibleProfileCount,
    storedCurrentLevel,
    calculatedLevel: calculatedState.level,
    effectiveLevel,
    nextLevel,
    nextLevelThreshold,
    remainingToNext,
    progressPercent,
    isNearLevelUp: remainingToNext <= NEAR_LEVEL_UP_THRESHOLD,
    schoolState: classifySchoolState(visibleProfileCount),
    levelUpdatedAt,
  }
}
