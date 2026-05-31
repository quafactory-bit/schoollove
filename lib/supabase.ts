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

// Admin client - service_role key, BYPASSES RLS
// CRITICAL: Only import from server-side code (API routes, server components).
// NEVER import from client components ('use client').
// NEVER expose this key to the browser.
export function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

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
