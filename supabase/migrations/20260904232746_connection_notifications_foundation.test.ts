import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260904232746_connection_notifications_foundation.sql'), 'utf8')
describe('connection notification legacy-store cutover', () => {
  it('reuses public.notifications with one non-backfilled visibility column', () => {
    expect(sql).toContain('ALTER TABLE public.notifications ADD COLUMN in_app_visible boolean NOT NULL DEFAULT false;')
    expect(sql).not.toContain('CREATE TABLE public.connection_notifications')
    expect(sql).not.toMatch(/UPDATE public\.notifications\s+SET\s+in_app_visible/i)
  })
  it('exposes only approved legacy kinds through the trigger and owner RPCs', () => {
    expect(sql).toContain("NEW.kind IN ('connection_request', 'connection_reminder', 'request_accepted')")
    expect(sql).toContain('BEFORE INSERT ON public.notifications')
    expect(sql).toContain("WHEN 'connection_request' THEN 'request_received'")
    expect(sql).toContain('notification.in_app_visible = true')
    expect(sql).toContain('notification.request_id IS NOT NULL')
    expect(sql).toContain("CREATE UNIQUE INDEX notifications_in_app_visible_request_kind_unique ON public.notifications (user_id, request_id, kind) WHERE in_app_visible = true AND request_id IS NOT NULL AND kind IN ('connection_request', 'connection_reminder', 'request_accepted');")
    expect(sql).toContain('CREATE INDEX notifications_in_app_visible_owner_read_created_idx ON public.notifications (user_id, read_at, created_at DESC) WHERE in_app_visible = true;')
  })
  it('keeps direct reads closed and grants only owner RPCs', () => {
    expect(sql).toContain('REVOKE SELECT ON TABLE public.notifications FROM authenticated;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.set_connection_notification_visibility() FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.mark_own_connection_notification_read(uuid) TO authenticated, service_role;')
  })
})
