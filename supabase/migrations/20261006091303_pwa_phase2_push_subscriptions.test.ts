import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261006091303_pwa_phase2_push_subscriptions.sql'),
  'utf8',
)

describe('PWA Phase 2 push subscription migration', () => {
  it('구독을 Auth 사용자에 연결하고 탈퇴 시 두 경계에서 삭제한다', () => {
    expect(sql).toContain('user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(sql).toContain('DELETE FROM public.push_subscriptions')
    expect(sql).toContain('WHERE user_id = requester;')
  })

  it('공개 client 권한 없이 service role만 테이블을 사용한다', () => {
    expect(sql).toContain('ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;')
    expect(sql).toContain('REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO service_role;')
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]+push_subscriptions/i)
  })

  it('endpoint는 유일하고 암호화 키와 생성 시각을 필수로 저장한다', () => {
    expect(sql).toContain('endpoint text NOT NULL UNIQUE')
    expect(sql).toContain('p256dh text NOT NULL')
    expect(sql).toContain('auth text NOT NULL')
    expect(sql).toContain('created_at timestamptz NOT NULL DEFAULT now()')
  })
})
