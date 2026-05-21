import { createClient } from '@supabase/supabase-js'
import type { School } from '@/types/school'
import type { Profile, Report } from '@/types/profile'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경변수가 설정되지 않았습니다.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 서버 컴포넌트용 (SSR) — 동일 anon key 사용 (서비스 키 없이 운영)
export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
})

// ─── Database 타입 ───────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      schools: {
        Row: School
        Insert: Omit<School, 'id' | 'created_at'>
        Update: Partial<Omit<School, 'id' | 'created_at'>>
      }
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'id' | 'report_count' | 'is_hidden' | 'created_at' | 'school'>
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'school'>>
      }
      reports: {
        Row: Report
        Insert: Omit<Report, 'id' | 'status' | 'created_at' | 'profile'>
        Update: Partial<Omit<Report, 'id' | 'created_at' | 'profile'>>
      }
    }
  }
}
