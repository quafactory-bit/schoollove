import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ConnectionRequestSchema,
  ExactPersonSearchSchema,
  containsExternalContact,
} from '@/lib/policy/connectionSafety'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const routeBoundary = read('lib/api/connectionRoute.ts')
const rateLimit = read('lib/security/connectionRateLimit.ts')
const service = read('lib/connections.ts')
const searchRoute = read('app/api/connections/search/route.ts')
const requestRoute = read('app/api/connections/requests/route.ts')
const requestActionRoute = read('app/api/connections/requests/[id]/route.ts')
const connectionRoute = read('app/api/connections/route.ts')
const connectionObjectRoute = read('app/api/connections/[id]/route.ts')
const messageRoute = read('app/api/connections/[id]/messages/route.ts')
const instagramRoute = read('app/api/connections/[id]/instagram/route.ts')
const reportRoute = read('app/api/connections/[id]/report/route.ts')
const requestsPage = read('app/connections/requests/page.tsx')
const conversationPage = read('app/connections/[id]/page.tsx')
const sql = read('supabase/migrations/20260728180000_safe_connection_request_messaging.sql')
const launchSql = read('supabase/migrations/20260803120000_public_account_soft_launch.sql')
const onboarding = read('lib/onboarding.ts')

function rpc(name: string, nextName: string) {
  return sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`), sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`))
}

describe('PHASE 10U dormant people-discovery readiness audit', () => {
  it('records the exact action-to-feature dependencies and protective no-feature actions', () => {
    expect(routeBoundary).toContain("search: ['people_search']")
    expect(routeBoundary).toContain("request: ['people_search','connection_request']")
    expect(routeBoundary).toContain("reminder: ['people_search','connection_request']")
    expect(routeBoundary).toContain("response: ['people_search','connection_request']")
    expect(routeBoundary).toContain("message: ['messaging']")
    expect(routeBoundary).toContain("instagram: ['instagram_permission']")
    expect(connectionObjectRoute.match(/requireConnectionContext\(request, 'response', \[\]\)/g)).toHaveLength(2)
    expect(reportRoute).toContain("requireConnectionContext(request, 'report')")
  })

  it('records alternate page/read paths that do not themselves require the dormant feature', () => {
    expect(requestsPage).not.toContain('hasBetaFeatureAccess')
    expect(conversationPage).not.toContain('hasBetaFeatureAccess')
    expect(connectionRoute).toContain('requireConnectionContext(request)')
    expect(connectionRoute).not.toContain("requireConnectionContext(request, '")
    const instagramGet = instagramRoute.slice(instagramRoute.indexOf('export async function GET'), instagramRoute.indexOf('export async function POST'))
    expect(instagramGet).toContain('requireConnectionContext(request)')
    expect(instagramGet).not.toContain("'instagram'")
  })

  it('records that public emergency state is absent from page, API and discovery RPC authority', () => {
    const searchRpc = rpc('find_exact_private_profile_match', 'create_connection_request')
    const requestRpc = rpc('create_connection_request', 'remind_connection_request')
    for (const source of [routeBoundary, searchRoute, requestRoute, searchRpc, requestRpc]) {
      expect(source).not.toMatch(/public_account_access_active|emergency_stopped/)
    }
    expect(launchSql).toContain("WHEN 'connection_match_tokens' THEN 'people_search'")
    expect(launchSql).toContain("WHEN 'connection_requests' THEN 'connection_request'")
  })

  it('records the cross-school authority gap and missing requester-membership recheck', () => {
    const searchRpc = rpc('find_exact_private_profile_match', 'create_connection_request')
    const requestRpc = rpc('create_connection_request', 'remind_connection_request')
    expect(searchRpc).toContain('WHERE actor_membership.owner_user_id = actor_user_id')
    expect(searchRpc).not.toMatch(/actor_membership\.school_id\s*=\s*target_school_id/)
    expect(requestRpc).not.toMatch(/profile_school_memberships[\s\S]*owner_user_id\s*=\s*actor_user_id/)
  })

  it('records exact-only input normalization and rejects one-character, chosung and extra fields', () => {
    const base = { school_id: '11111111-1111-4111-8111-111111111111', graduation_year: 2005 }
    expect(ExactPersonSearchSchema.parse({ ...base, exact_name: '  Ａlice  ' }).exact_name).toBe('Alice')
    expect(ExactPersonSearchSchema.safeParse({ ...base, exact_name: '김하늘' }).success).toBe(true)
    expect(ExactPersonSearchSchema.safeParse({ ...base, exact_name: '김' }).success).toBe(false)
    expect(ExactPersonSearchSchema.safeParse({ ...base, exact_name: 'ㄱㅎㄴ' }).success).toBe(false)
    expect(ExactPersonSearchSchema.safeParse({ ...base, exact_name: '김하늘', page: 1 }).success).toBe(false)
    expect(sql).toContain('lower(btrim(p.display_name)) = lower(btrim(exact_display_name))')
    expect(sql).not.toMatch(/ILIKE|SIMILAR TO/)
  })

  it('records generic ambiguity/self handling but distinguishable relationship and block states', () => {
    const searchRpc = rpc('find_exact_private_profile_match', 'create_connection_request')
    expect(searchRpc).toContain('IF matched_count <> 1')
    expect(searchRpc).toContain('p.owner_user_id <> actor_user_id')
    for (const state of ['not_found', 'request_unavailable', 'already_connected', 'already_requested', 'match_available']) {
      expect(searchRpc).toContain(`'${state}'`)
    }
  })

  it('records opaque, hashed, requester-bound, receiver-bound, expiring and single-use tokens', () => {
    expect(sql).toContain("token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$')")
    expect(sql).toContain("expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')")
    expect(sql).toContain('requester_user_id uuid NOT NULL')
    expect(sql).toContain('receiver_user_id uuid NOT NULL')
    expect(sql).toContain('target_school_membership_id uuid NOT NULL')
    expect(sql).toContain('token_row.requester_user_id <> actor_user_id')
    expect(sql).toContain('token_row.used_at IS NOT NULL OR token_row.expires_at <= now()')
    expect(sql).toContain('FOR UPDATE')
    const browserMatchResult = service.slice(
      service.indexOf('export async function findExactConnectionMatch'),
      service.indexOf('export async function createConnectionRequest'),
    )
    expect(browserMatchResult).not.toMatch(/receiverUserId|receiver_user_id/)
  })

  it('records request terminality, immutable greeting and receiver-only response authority', () => {
    const createRpc = rpc('create_connection_request', 'remind_connection_request')
    const respondRpc = rpc('respond_connection_request', 'send_connection_message')
    expect(createRpc).toMatch(/EXISTS \([\s\S]*connection_requests[\s\S]*pair_low_id[\s\S]*pair_high_id/)
    expect(sql).toContain('connection_requests_immutable_content')
    expect(sql).toContain('connection_requests_status_guard')
    expect(respondRpc).toContain('req.receiver_user_id <> actor_user_id')
    expect(respondRpc).not.toMatch(/is_current_adult_account\((?:req\.)?(?:sender|receiver)/)
    expect(requestActionRoute).not.toMatch(/sender_user_id|receiver_user_id/)
  })

  it('records current greeting filter coverage and known obfuscation bypass classes', () => {
    for (const rejected of [
      'https://example.com', 'example.kr', 'hello@example.com', '010-1234-5678',
      '@friend', '카톡 아이디 friend12', 'Ｉｎｓｔａｇｒａｍ： friend12', 'https:\u200b//example.com',
    ]) {
      expect(ConnectionRequestSchema.safeParse({
        match_token: '11111111-1111-4111-8111-111111111111',
        relationship_type: 'same_school',
        message: rejected,
      }).success).toBe(false)
    }
    for (const acceptedObfuscation of [
      '0 1 0 1 2 3 4 5 6 7 8', 'example dot kr', '(@friend_name)', 'k a k a o id friend12',
    ]) {
      expect(containsExternalContact(acceptedObfuscation)).toBe(false)
    }
  })

  it('records pre-accept and post-accept browser-visible fields without user/Auth UUIDs', () => {
    expect(service).toContain('senderName: names.get(row.sender_user_id)')
    expect(service).toContain('relationshipType: row.relationship_type')
    expect(service).toContain('message: row.message')
    expect(service).toContain('schoolName')
    expect(service).toContain('graduationYear')
    expect(service).toContain("return { id: row.id, displayName:")
    const browserMappings = service.slice(
      service.indexOf('return {\n    received:'),
      service.indexOf('export async function sendConnectionMessage'),
    )
    expect(browserMappings).not.toMatch(/^\s*(?:sender_user_id|receiver_user_id|owner_user_id):/m)
  })

  it('records participant-scoped IDOR defenses across request, connection, message and report RPCs', () => {
    expect(sql).toContain('req.receiver_user_id <> actor_user_id')
    expect(sql).toContain('sender_user_id = actor_user_id')
    expect(sql).toContain('actor_user_id NOT IN (conn.user_low_id, conn.user_high_id)')
    expect(sql).toContain('actor_user_id NOT IN (conn.user_low_id,conn.user_high_id)')
    expect(sql).toContain('m.sender_user_id=other_user')
    expect(service).toContain('.eq(\'id\', connectionId).maybeSingle()')
    expect(service).toContain('![row.user_low_id, row.user_high_id].includes(userId)')
  })

  it('records RLS/FORCE, service-only mutations and authenticated direct-write denial', () => {
    for (const table of [
      'connection_match_tokens', 'connection_requests', 'connections', 'connection_messages',
      'user_blocks', 'safety_reports', 'connection_instagram_permissions', 'notifications',
      'safety_account_restrictions',
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`)
    }
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO service_role')
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]+TO authenticated/i)
  })

  it('records messaging and Instagram as independently gated while preserving safety mutations', () => {
    expect(messageRoute.match(/requireConnectionContext\(request, 'message'\)/g)).toHaveLength(3)
    expect(instagramRoute).toContain("requireConnectionContext(request, 'instagram')")
    expect(connectionObjectRoute).toContain("requireConnectionContext(request, 'response', [])")
    expect(reportRoute).toContain("requireConnectionContext(request, 'report')")
    expect(sql).toMatch(/disconnect_connection[\s\S]*connection_instagram_permissions[\s\S]*status='revoked'/)
    expect(sql).toMatch(/report_connection_safety[\s\S]*INSERT INTO public\.user_blocks[\s\S]*status='revoked'/)
  })

  it('records exact IP/account limits, fail-closed production behavior and forwarded-IP assumption', () => {
    expect(rateLimit).toContain("search: { count: 20, window: '1 d' }")
    expect(rateLimit).toContain("request: { count: 5, window: '1 d' }")
    expect(rateLimit).toContain("process.env.NODE_ENV === 'production'")
    expect(rateLimit).toContain('return { allowed: false, status: 503 }')
    expect(rateLimit).toContain("hashConnectionRateIdentity('ip', input.ip)")
    expect(rateLimit).toContain("hashConnectionRateIdentity('account', input.userId)")
    expect(rateLimit).toContain("request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()")
    expect(rateLimit).toContain("|| 'unknown'")
    expect(routeBoundary).toContain("response.headers.set('Retry-After'")
  })

  it('records coarse analytics only and no legacy public-profile search authority', () => {
    expect(searchRoute).toContain("recordLimitedLaunchEvent('people_search_completed')")
    expect(requestRoute).toContain("recordLimitedLaunchEvent('connection_request_created')")
    expect(onboarding).toContain('requested_event_key:`phase10h.${event}`,requested_count:1')
    expect(onboarding).not.toMatch(/school_id|graduation_year|match_token|target_user|message/)
    const searchRpc = rpc('find_exact_private_profile_match', 'create_connection_request')
    expect(searchRpc).toContain('public.private_profiles')
    expect(searchRpc).toContain('public.profile_school_memberships')
    expect(searchRpc).not.toMatch(/public\.profiles|instagram_id|nickname/)
  })
})
