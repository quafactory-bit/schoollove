import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { School } from '@/types/school';
import type { Profile, Report } from '@/types/profile';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars are missing');
}

type BrowserSupabaseScope = typeof globalThis & {
  __schoolloveBrowserSupabaseClient?: SupabaseClient;
};

type BrowserSupabaseFactory = () => SupabaseClient;

/**
 * Reuses one anon/RLS client for the full browser-context lifetime. The slot
 * survives repeated Next.js Fast Refresh module evaluations after the fixed
 * module first loads. Server auth clients intentionally stay in
 * lib/user-auth.ts and continue to be created per request/session.
 */
export function getOrCreateBrowserSupabaseClient(
  scope: BrowserSupabaseScope = globalThis as BrowserSupabaseScope,
  factory: BrowserSupabaseFactory = () => createClient(supabaseUrl, supabaseAnonKey),
): SupabaseClient {
  scope.__schoolloveBrowserSupabaseClient ??= factory();
  return scope.__schoolloveBrowserSupabaseClient;
}

// Browser client (RLS applies). The server render gets a stateless anon client;
// the browser gets the stable context singleton above.
export const supabase = typeof window === 'undefined'
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : getOrCreateBrowserSupabaseClient();

// SSR client - same anon key, RLS applies. Client bundles that import a shared
// data helper must not create a second GoTrueClient under the same storage key.
export const supabaseServer = typeof window === 'undefined'
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : supabase;

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
