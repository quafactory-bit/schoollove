// docs/design-package-v1.0/03-level-policy.md §2 LevelState 계약
export type LevelState = {
  level: number
  xpIntoLevel: number
  xpForNextLevel: number
  remainingToNext: number
}

export type LevelPolicy = (cumulativeXp: number) => LevelState

// docs/design-package-v1.0/03-level-policy.md §8 저장 규칙 판단 결과
export type LevelPersistenceDecision = {
  level: number
  shouldPersistLevel: boolean
  levelIncreased: boolean
}

// docs/design-package-v1.0/12-db-schema.md §2 — Supabase Level persistence I/O wrapper가
// select할 schools 테이블 projection 계약.
export type SchoolLevelPersistenceRow = {
  id: string
  current_level: number | null
  level_updated_at: string | null
}
