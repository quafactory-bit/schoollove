import type { School } from './school'

export interface Profile {
  id: string
  school_id: string
  graduation_year: number
  grade: number | null
  class_number: number | null
  department: string | null
  student_year: number | null
  nickname: string
  instagram_id: string | null
  report_count: number
  is_hidden: boolean
  created_at: string
  // join 시
  school?: School
}

export interface ProfileInsert {
  school_id: string
  graduation_year: number
  grade?: number | null
  class_number?: number | null
  department?: string | null
  student_year?: number | null
  nickname: string
  instagram_id?: string | null
}

export interface Report {
  id: string
  profile_id: string
  type: 'report' | 'edit' | 'delete'
  reason: string
  requested_instagram_id: string | null
  is_self_claimed: boolean
  status: 'pending' | 'done'
  created_at: string
  // join 시
  profile?: Profile
}

export interface ReportInsert {
  profile_id: string
  type: 'report' | 'edit' | 'delete'
  reason: string
  requested_instagram_id?: string | null
  is_self_claimed: boolean
}
