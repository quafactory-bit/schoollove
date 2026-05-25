import { createClient } from '@supabase/supabase-js';
import type { School } from '@/types/school';
import type { Profile, Report } from '@/types/profile';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars are missing');
}

// Browser client (RLS applies)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// SSR client - same anon key, RLS applies
export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

// Database types
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
        Insert: Omit<Profile, 'id' | 'report_count' | 'is_hidden' | 'created_at' | 'school'>;
        Update: Partial<Omit<Profile, 'id' | 'report_count' | 'is_hidden' | 'created_at' | 'school'>>;
      };
      reports: {
        Row: Report;
        Insert: Omit<Report, 'id' | 'created_at'>;
        Update: Partial<Omit<Report, 'id' | 'created_at'>>;
      };
    };
  };
};
