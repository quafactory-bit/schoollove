/**
 * PHASE 10A indexing boundary.
 * School pages contain school-only information and may be indexed. Year/Class
 * routes are personal discovery routes and remain fail-closed regardless of
 * historic profile counts.
 */
export function isSchoolPageIndexable(): boolean {
  return true
}

export function isYearPageIndexable(): boolean {
  return false
}

export function isClassPageIndexable(): boolean {
  return false
}
