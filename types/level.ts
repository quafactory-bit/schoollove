// docs/design-package-v1.0/03-level-policy.md §2 LevelState 계약
export type LevelState = {
  level: number
  xpIntoLevel: number
  xpForNextLevel: number
  remainingToNext: number
}

export type LevelPolicy = (cumulativeXp: number) => LevelState
