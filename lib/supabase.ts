import { createClient } from '@supabase/supabase-js';
import type { School } from '@/types/school';
import type { Profile, Report } from '@/types/profile';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
}

// 브라우저용 클라이언트 (RLS 적용)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 서버 컴포넌트(SSR)용 — 동일한 anon key, RLS 적용
export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

// 관리자 전용 클라이언트 — service_role key로 RLS 우회
// ⚠️ 절대 클라이언트 컴포넌트에서 import하지 말 것!
// 서버 컴포넌트 / API Route / Server Action에서만 사용.
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  // 빌드 타임에 service_role 키가 없어도 다른 경로(일반 페이지) 빌드가 실패하지 않도록 lazy 초기화
  if (_supabaseAdmin) return _supabaseAdmin;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. ' +
        '관리자 기능을 사용하려면 Vercel 환경변수에 추가하세요.'
    );
  }

  _supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _supabaseAdmin;
}

// ─── Database 타입 ─────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      schools: {
        Row: School;
        Insert: Omit<School, 'id' | 'created_at'>;
        Update: Partial<Omit<School, 'id' | 'created_at'>>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit
          Profile,
          'id' | 'report_count' | 'is_hidden' | 'created_at' | 'school'
        >;
        Update: Partial
          Omit
            Profile,
            'id' | 'report_count' | 'is_hidden' | 'created_at' | 'school'
          >
        >;
      };
      reports: {
        Row: Report;
        Insert: Omit<Report, 'id' | 'created_at'>;
        Update: Partial<Omit<Report, 'id' | 'created_at'>>;
      };
    };
  };
};
