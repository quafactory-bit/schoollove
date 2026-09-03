import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260903023006_connected_instagram_owner_handle_update.sql'), 'utf8').replace(/\r\n/g, '\n')

describe('Connected Instagram owner handle migration', () => {
  it('is a single forward transaction without schema or data expansion', () => {
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1)
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1)
    expect(sql).not.toMatch(/\bCREATE TABLE\b|\bALTER TABLE\b|\bINSERT INTO\b|\bDELETE FROM\b/i)
  })

  it('derives the owner and changes only the existing profile handle', () => {
    expect(sql).toContain('requester uuid := auth.uid()')
    expect(sql).toContain('WHERE profile.owner_user_id = requester')
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('SET instagram_handle = normalized_instagram')
    expect(sql).toContain('updated_at = clock_timestamp()')
    expect(sql).not.toMatch(/requested_(user|profile)_id|display_name\s*=|introduction\s*=|profile_visibility\s*=|status\s*=/)
  })

  it('requires active Instagram access to set but not to clear', () => {
    expect(sql).toContain('IF normalized_instagram IS NOT NULL')
    expect(sql).toContain("public.has_beta_feature_access(requester, 'instagram_permission')")
    expect(sql).toContain("RAISE EXCEPTION 'CONNECTED_INSTAGRAM_ACCESS_REQUIRED'")
    expect(sql).toContain("RAISE EXCEPTION 'PRIVATE_PROFILE_REQUIRED'")
  })

  it('normalizes, validates, and keeps an explicit privilege boundary', () => {
    expect(sql).toContain("normalize(coalesce(requested_instagram_handle, ''), NFKC)")
    expect(sql).toContain("'^[a-z0-9._]{1,30}$'")
    expect(sql).toContain("SECURITY DEFINER\nSET search_path = ''")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.update_own_connected_instagram_handle(text)')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('TO authenticated, service_role;')
  })
})
