import type { LevelPersistenceDecision, LevelState } from '@/types/level'

// ─── Level 저장/보존 규칙 (FROZEN) ────────────────────────────────
// docs/design-package-v1.0/03-level-policy.md §8 저장 규칙을 이 함수 한 곳에서 소유한다.
// Level 공식은 재구현하지 않는다 — calculateLevelState()가 반환한 LevelState만 입력으로 받는다.
//
// shouldPersistLevel: current_level DB 값을 실제로 써야 하는가
// levelIncreased: 저장된 실제 레벨보다 상승했는가 (level_updated_at 갱신 여부에만 사용)
//
// storedLevel이 null인 학교는 아직 backfill되지 않은 상태다.
// "레벨은 1부터 시작한다"에 따라 calculateLevelState()는 항상 level >= 1을 반환하므로
// null → level 초기화는 저장은 필요하지만 실제 레벨 상승 이벤트는 아니다.
export function resolveLevelUpdate(
  storedLevel: number | null,
  newState: LevelState
): LevelPersistenceDecision {
  if (storedLevel === null) {
    return {
      level: newState.level,
      shouldPersistLevel: true,
      levelIncreased: false,
    }
  }

  if (newState.level > storedLevel) {
    return {
      level: newState.level,
      shouldPersistLevel: true,
      levelIncreased: true,
    }
  }

  // 레벨은 절대 내려가지 않는다 — 저장된 레벨을 그대로 유지한다.
  return {
    level: storedLevel,
    shouldPersistLevel: false,
    levelIncreased: false,
  }
}
