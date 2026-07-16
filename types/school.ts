export type SchoolType = 'elementary' | 'middle' | 'high' | 'university' | 'college'

export interface School {
  id: string
  school_name: string
  school_type: SchoolType
  sido: string
  sigungu: string
  address: string
  school_code: string
  slug: string
  created_at: string
  // docs/design-package-v1.0/12-db-schema.md P1 추가 컬럼. select('*')로 이미 항상 함께
  // 내려오던 값인데 타입에는 없었다(School Hub Growth Panel이 재조회 없이 재사용하기 위해 추가).
  // optional로 둔 이유: lib/api/search.ts::SchoolSearchResult(무관한 검색 결과 타입, 이
  // 컬럼을 select하지 않음)와의 불필요한 충돌을 피하기 위함 — School Hub에서는 항상
  // getSchoolBySlug()의 실제 select('*') 결과이므로 값 자체는 항상 존재한다.
  current_level?: number | null
  level_updated_at?: string | null
  // 집계 (join 시)
  profile_count?: number
}

export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
  university: '대학교',
  college: '전문대학',
}

export const SCHOOL_TYPE_SHORT: Record<SchoolType, string> = {
  elementary: '초',
  middle: '중',
  high: '고',
  university: '대',
  college: '전문대',
}

export function isK12(type: SchoolType): boolean {
  return type === 'elementary' || type === 'middle' || type === 'high'
}

export function isUniversity(type: SchoolType): boolean {
  return type === 'university' || type === 'college'
}
