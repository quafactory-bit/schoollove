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
