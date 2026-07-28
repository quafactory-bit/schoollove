import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260728150000_auth_adult_profile_ownership.sql'),
  'utf8'
)

describe('PHASE 10B auth/adult/ownership migration', () => {
  it('기존 profiles row를 삭제하거나 임의 owner에게 연결하지 않는다', () => {
    const schemaSetup = sql.slice(0, sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_apply_moderation_action'))
    expect(schemaSetup).not.toMatch(/\b(?:DELETE|TRUNCATE)\s+(?:FROM\s+)?public\.profiles\b/i)
    expect(schemaSetup).not.toMatch(/UPDATE\s+public\.profiles\s+SET\s+owner_user_id/i)
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS ownership_status text,')
    expect(sql).toContain("ALTER COLUMN ownership_status SET DEFAULT 'quarantined'")
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS ownership_status[^;]*DEFAULT/i)
    expect(sql).toContain('owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL')
  })

  it('생년월일 컬럼 없이 self-attestation 결과만 저장한다', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.adult_eligibility_records')
    expect(sql).toContain("verification_method text NOT NULL CHECK (verification_method = 'self_attestation')")
    expect(sql).not.toMatch(/date_of_birth|birth_date|birthday/i)
  })

  it('필수 동의를 append-only로 저장한다', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.consent_records')
    expect(sql).toContain('GRANT SELECT ON public.adult_eligibility_records TO authenticated;')
    expect(sql).toContain('GRANT SELECT, INSERT ON public.consent_records TO authenticated;')
    expect(sql).not.toMatch(/GRANT[^;]*INSERT[^;]*adult_eligibility_records[^;]*TO authenticated/i)
    expect(sql).not.toMatch(/GRANT[^;]*UPDATE[^;]*consent_records/i)
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*consent_records/i)
  })

  it('private profile과 학교 이력을 owner-only로 제한한다', () => {
    expect(sql).toContain('owner_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(sql).toContain('FOR SELECT TO authenticated USING (owner_user_id = auth.uid())')
    expect(sql).toContain('public.has_current_adult_access(auth.uid())')
    expect(sql).toContain("profile_visibility text NOT NULL DEFAULT 'private' CHECK (profile_visibility = 'private')")
    expect(sql).toContain('ALTER TABLE public.private_profiles FORCE ROW LEVEL SECURITY;')
    expect(sql).toContain('ALTER TABLE public.profile_school_memberships FORCE ROW LEVEL SECURITY;')
  })

  it('security definer 함수는 빈 search_path와 최소 EXECUTE 권한을 사용한다', () => {
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = ''/)
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.has_current_adult_access(uuid) FROM PUBLIC, anon;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.has_current_adult_access(uuid) TO authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.request_own_account_deletion(text) TO authenticated;')
  })

  it('admin audit log는 public/authenticated 정책을 만들지 않는다', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.admin_audit_logs')
    expect(sql).toContain('public.account_deletion_requests, public.admin_audit_logs FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('public.account_deletion_requests, public.admin_audit_logs TO service_role;')
    expect(sql).not.toMatch(/CREATE POLICY[^;]+ON public\.admin_audit_logs/i)
  })

  it('모든 신규 개인정보 테이블은 RLS를 enable하고 force한다', () => {
    for (const table of [
      'adult_eligibility_records', 'consent_records', 'private_profiles',
      'profile_school_memberships', 'account_deletion_requests', 'admin_audit_logs',
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`)
    }
  })
})
