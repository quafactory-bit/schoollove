import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260904232746_connection_notifications_foundation.sql'), 'utf8')

describe('connection notification foundation migration', () => {
  it('adds only the purpose-limited notification table and no backfill', () => {
    expect(sql.match(/CREATE TABLE public\.[a-z_]+/g)).toEqual(['CREATE TABLE public.connection_notifications'])
    expect(sql).not.toMatch(/INSERT INTO public\.connection_notifications\s*(?:\([^)]*\))?\s*SELECT/i)
    expect(sql).toContain('owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(sql).toContain('request_id uuid NOT NULL REFERENCES public.connection_requests(id) ON DELETE CASCADE')
    expect(sql).toContain('UNIQUE (owner_user_id, request_id, event_type)')
    expect(sql).toContain('connection_notifications_owner_unread_created_idx')
  })

  it('limits event types and payload to the three approved connection events', () => {
    for (const event of ['request_received', 'request_reminded', 'request_accepted']) expect(sql).toContain(`'${event}'`)
    for (const forbidden of ['request_declined', 'not_the_person', 'cancelled', 'blocked', 'reported', 'instagram', 'message']) expect(sql).not.toMatch(new RegExp(`event_type[^\n]*${forbidden}|notification_event := '${forbidden}'`, 'i'))
    expect(sql).not.toMatch(/message|display_name|school_id|graduation|class_number|instagram|email|phone/i)
  })

  it('creates rows only from request creation, first reminder, and pending acceptance', () => {
    expect(sql).toContain("IF TG_OP = 'INSERT' THEN")
    expect(sql).toContain("ELSIF OLD.reminder_count = 0 AND NEW.reminder_count = 1 THEN")
    expect(sql).toContain("ELSIF OLD.status = 'pending' AND NEW.status = 'accepted' THEN")
    expect(sql).toContain('ON CONFLICT (owner_user_id, request_id, event_type) DO NOTHING')
    expect(sql).toContain('AFTER INSERT OR UPDATE ON public.connection_requests')
  })

  it('keeps direct table access closed and owner RPCs narrow', () => {
    expect(sql).toContain('ALTER TABLE public.connection_notifications ENABLE ROW LEVEL SECURITY;')
    expect(sql).toContain('ALTER TABLE public.connection_notifications FORCE ROW LEVEL SECURITY;')
    expect(sql).toContain('REVOKE ALL ON TABLE public.connection_notifications FROM PUBLIC, anon, authenticated;')
    for (const name of ['get_own_connection_notifications(integer)', 'get_own_connection_notification_unread_count()', 'mark_own_connection_notification_read(uuid)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC, anon;`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name} TO authenticated, service_role;`)
    }
    expect(sql.match(/SECURITY DEFINER\nSET search_path = ''/g)).toHaveLength(4)
    expect(sql).toContain('notification.owner_user_id = auth.uid()')
    expect(sql).toContain('LIMIT LEAST(GREATEST(COALESCE(requested_limit, 20), 1), 50)')
  })
})
