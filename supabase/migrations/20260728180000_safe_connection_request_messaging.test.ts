import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260728180000_safe_connection_request_messaging.sql'), 'utf8')

const privateTables = [
  'connection_match_tokens', 'connection_requests', 'connections', 'connection_messages',
  'user_blocks', 'safety_reports', 'connection_instagram_permissions', 'notifications',
  'safety_account_restrictions',
]

describe('PHASE 10C safe connection migration', () => {
  it('모든 개인 테이블에 RLS enable/force를 적용하고 anon 접근을 부여하지 않는다', () => {
    for (const table of privateTables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`)
    }
    expect(sql).toMatch(/FROM PUBLIC, anon, authenticated/)
    expect(sql).not.toMatch(/GRANT[^;]+TO anon/i)
  })

  it('검색은 exact equality와 opaque token만 사용하고 부분·목록 검색을 만들지 않는다', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.find_exact_private_profile_match')
    expect(sql).toContain('lower(btrim(p.display_name)) = lower(btrim(exact_display_name))')
    expect(sql).toContain('connection_match_tokens')
    expect(sql).not.toMatch(/ILIKE|SIMILAR TO/i)
  })

  it('최초 메시지는 불변이고 200자, 연결 메시지는 500자이며 연락처를 DB에서도 거부한다', () => {
    expect(sql).toContain('CHECK (public.connection_text_is_safe(message, 200))')
    expect(sql).toContain('CHECK (public.connection_text_is_safe(message, 500))')
    expect(sql).toContain('connection_requests_immutable_content')
    expect(sql).toMatch(/https\?\:\/\//i)
  })

  it('7일 후 단 한 번의 원자적 reminder만 허용한다', () => {
    expect(sql).toContain('reminder_count smallint NOT NULL DEFAULT 0 CHECK (reminder_count IN (0, 1))')
    expect(sql).toMatch(/UPDATE public\.connection_requests[\s\S]*reminder_count = 1[\s\S]*status = 'pending'[\s\S]*reminder_count = 0[\s\S]*interval '7 days'/)
    expect(sql).toContain("'connection_reminder'")
  })

  it('두 번째 활성 안부와 terminal 상태 뒤 재요청을 DB에서 막는다', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX connection_requests_one_active_pair[\s\S]*status IN \('pending', 'accepted'\)/)
    const createStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.create_connection_request')
    const createEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.remind_connection_request')
    const createRpc = sql.slice(createStart, createEnd)
    expect(createRpc).toMatch(/EXISTS \([\s\S]*connection_requests[\s\S]*sender_user_id = actor_user_id[\s\S]*receiver_user_id = token_row.receiver_user_id/)
    expect(createRpc).toContain('EXCEPTION WHEN unique_violation')
  })

  it('reminder는 pending·7일·count 0 조건을 한 UPDATE에서 잠가 동시 중복을 막는다', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.remind_connection_request')
    const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.cancel_connection_request')
    const rpc = sql.slice(start, end)
    expect(rpc).toContain("status = 'pending'")
    expect(rpc).toContain('reminder_count = 0')
    expect(rpc).toContain("sent_at <= now() - interval '7 days'")
    expect(rpc.match(/INSERT INTO public\.notifications/g)).toHaveLength(1)
  })

  it('차단은 검색·요청·대화에서 모두 적용되고 신고는 차단과 연결 종료를 함께 수행한다', () => {
    const searchRpc = sql.slice(sql.indexOf('find_exact_private_profile_match'), sql.indexOf('create_connection_request'))
    const requestRpc = sql.slice(sql.indexOf('create_connection_request'), sql.indexOf('remind_connection_request'))
    const messageRpc = sql.slice(sql.indexOf('send_connection_message'), sql.indexOf('mark_connection_messages_read'))
    expect(searchRpc).toContain('public.user_blocks')
    expect(requestRpc).toContain('public.user_blocks')
    expect(messageRpc).toContain('public.user_blocks')
    const reportRpc = sql.slice(sql.indexOf('report_connection_safety'), sql.indexOf('block_connection_user'))
    expect(reportRpc).toContain('INSERT INTO public.user_blocks')
    expect(reportRpc).toContain("status='reported'")
  })

  it('수락 전 메시지, 연결 해제 뒤 메시지와 Instagram 자동 공개를 허용하지 않는다', () => {
    const messageRpc = sql.slice(sql.indexOf('send_connection_message'), sql.indexOf('mark_connection_messages_read'))
    expect(messageRpc).toMatch(/connections[\s\S]*conn\.status <> 'active'/)
    const disconnectRpc = sql.slice(sql.indexOf('disconnect_connection'), sql.indexOf('report_connection_safety'))
    expect(disconnectRpc).toContain("status='disconnected'")
    expect(disconnectRpc).toContain("status='revoked'")
    const respondRpc = sql.slice(sql.indexOf('respond_connection_request'), sql.indexOf('send_connection_message'))
    expect(respondRpc).not.toContain('connection_instagram_permissions')
  })

  it('Instagram은 활성 연결의 상대별 승인만 만들고 취소 시 즉시 revoked로 바꾼다', () => {
    const start = sql.indexOf('set_connection_instagram_permission')
    const end = sql.indexOf('admin_apply_connection_safety_action')
    const rpc = sql.slice(start, end)
    expect(rpc).toContain("conn.status <> 'active'")
    expect(rpc).toContain('grantor_user_id,grantee_user_id')
    expect(rpc).toContain("status='revoked'")
  })

  it('사용자 탈퇴 시 private 연결 FK가 정리되고 기존 public profiles는 건드리지 않는다', () => {
    expect(sql).toMatch(/REFERENCES auth\.users\(id\) ON DELETE (?:CASCADE|SET NULL)/)
    expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM) public\.profiles/i)
  })

  it('참여자 RLS 정책이 있어도 authenticated table write grant는 열지 않는다', () => {
    expect(sql).toContain('connection_requests_participant_select')
    expect(sql).toContain('connections_participant_select')
    expect(sql).toContain('connection_messages_participant_select')
    expect(sql).not.toMatch(/GRANT (?:INSERT|ALL)[^;]+TO authenticated/i)
  })

  it('수락·신고·연결 해제·Instagram 권한을 service-role 원자 RPC로 처리한다', () => {
    expect(sql).toMatch(/respond_connection_request[\s\S]*UPDATE public\.connection_requests[\s\S]*INSERT INTO public\.connections/)
    expect(sql).toMatch(/report_connection_safety[\s\S]*INSERT INTO public\.safety_reports[\s\S]*INSERT INTO public\.user_blocks/)
    expect(sql).toMatch(/disconnect_connection[\s\S]*connection_instagram_permissions[\s\S]*status='revoked'/)
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.set_connection_instagram_permission(uuid,uuid,boolean) TO service_role;')
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.(?:create_connection_request|send_connection_message)[^;]+TO authenticated/i)
  })

  it('관리자 안전 조치와 audit insert가 같은 RPC에 있다', () => {
    expect(sql).toMatch(/admin_apply_connection_safety_action[\s\S]*INSERT INTO public\.admin_audit_logs/)
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.admin_apply_connection_safety_action(text,uuid) TO service_role;')
  })
})
