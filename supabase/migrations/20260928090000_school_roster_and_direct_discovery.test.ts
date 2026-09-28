import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260928090000_school_roster_and_direct_discovery.sql', 'utf8')

describe('school roster and direct discovery migration', () => {
  it('records an explicit, reversible membership-level roster preference', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.school_roster_consents')
    expect(sql).toContain("policy_version = 'school-roster-2026-09-28'")
    expect(sql).toContain('requested_roster_consent boolean')
    expect(sql).toContain('IF requested_roster_consent THEN')
    expect(sql).toContain('withdrawn_at = clock_timestamp()')
    expect(sql).toContain('ON DELETE CASCADE')
    expect(sql).toContain('USING (owner_user_id = (SELECT auth.uid()))')
  })

  it('keeps the roster reciprocal, same-school and authenticated', () => {
    const roster = sql.slice(sql.indexOf('FUNCTION public.get_school_member_roster'), sql.indexOf('-- Public account members'))
    expect(roster).toContain('own_membership.school_id = requested_school_id')
    expect(roster).toContain('own_consent.withdrawn_at IS NULL')
    expect(roster).toContain('membership.school_id = requested_school_id')
    expect(roster).toContain("profile.status = 'active'")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_school_member_roster(uuid)')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO authenticated, service_role')
  })

  it('returns only the approved roster projection', () => {
    const roster = sql.slice(sql.indexOf('FUNCTION public.get_school_member_roster'), sql.indexOf('-- Public account members'))
    for (const field of ["'display_name'", "'graduation_year'", "'class_history'", "'grade_number'", "'class_number'"]) {
      expect(roster).toContain(field)
    }
    expect(roster).not.toMatch(/'owner_user_id'|'profile_id'|'membership_id'|'instagram_handle'|'email'|'introduction'/)
  })

  it('opens only search and connection requests for complete public accounts with active roster sharing', () => {
    const access = sql.slice(sql.indexOf('FUNCTION public.has_beta_feature_access'), sql.indexOf('REVOKE ALL ON FUNCTION public.add_own_school'))
    expect(access).toContain("requested_feature IN ('people_search','connection_request')")
    expect(access).toContain("control.control_key='public_account' AND control.state='emergency_stopped'")
    expect(access).toContain("deletion.user_id=target_user_id AND deletion.status<>'rejected'")
    expect(access).toContain('public.is_current_adult_account(target_user_id)')
    expect(access).toContain("profile.profile_visibility='private' AND profile.status='active'")
    expect(access).toContain('consent.withdrawn_at IS NULL')
    expect(access).not.toContain("requested_feature IN ('people_search','connection_request','messaging','instagram_permission')")
  })

  it('excludes people who hide from the roster from both exact-name search paths', () => {
    const exactMatch = sql.slice(
      sql.indexOf('FUNCTION public.find_exact_private_profile_match'),
      sql.indexOf('FUNCTION public.find_exact_private_profile_class_match'),
    )
    const classMatch = sql.slice(
      sql.indexOf('FUNCTION public.find_exact_private_profile_class_match'),
      sql.indexOf('REVOKE ALL ON FUNCTION public.add_own_school'),
    )

    for (const searchFunction of [exactMatch, classMatch]) {
      expect(searchFunction).toContain('JOIN public.school_roster_consents actor_consent')
      expect(searchFunction).toContain('actor_consent.withdrawn_at IS NULL')
      expect(searchFunction).toContain('JOIN public.school_roster_consents roster_consent')
      expect(searchFunction).toContain('roster_consent.withdrawn_at IS NULL')
    }

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.find_exact_private_profile_match')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.find_exact_private_profile_class_match')
    expect(sql).toContain('TO service_role')
  })
})
