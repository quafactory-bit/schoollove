import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(),path),'utf8')
const migration = read('supabase/migrations/20260826061123_people_discovery_safety_hardening.sql')
const boundary = read('lib/api/connectionRoute.ts')
const page = read('app/people/search/page.tsx')
const connectionsPage = read('app/connections/page.tsx')
const search = read('app/api/connections/search/route.ts')
const requests = read('app/api/connections/requests/route.ts')
const action = read('app/api/connections/requests/[id]/route.ts')
const instagram = read('app/api/connections/[id]/instagram/route.ts')
const client = read('app/people/search/PeopleSearchClient.tsx')
const safetyTest = read('lib/policy/connectionSafety.test.ts')
const disposableAudit = read('scripts/phase10v/disposable-audit.sql')

function rpc(name: string,next: string) {
  const nextMarker = next.startsWith('REVOKE ') ? next : `CREATE OR REPLACE FUNCTION public.${next}`
  return migration.slice(migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`),migration.indexOf(nextMarker))
}

describe('PHASE 10V narrow people-discovery hardening contract',()=>{
  it('adds one replacement-only migration without tables, columns, routes or functions',()=>{
    expect(migration.match(/CREATE OR REPLACE FUNCTION public\./g)).toHaveLength(6)
    expect(migration).not.toMatch(/CREATE\s+(?:TABLE|TYPE|VIEW|MATERIALIZED|SCHEMA)|ALTER\s+TABLE[\s\S]*ADD\s+COLUMN/i)
    for(const name of [
      'connection_text_is_safe','is_current_adult_account','find_exact_private_profile_match',
      'create_connection_request','remind_connection_request','respond_connection_request',
    ]) expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${name}`)
  })

  it('requires public-active at page and expansive API actions but not safety reads',()=>{
    expect(page).toContain('hasPublicAccountAccessActive(auth.client,auth.user.id)')
    expect(boundary).toContain("const publicActiveActions = new Set<ConnectionRateAction>(['search','request','reminder'])")
    expect(requests).toContain("requireConnectionContext(request, 'response', [])")
    expect(action).toContain("body.data.action === 'accept' ? ['people_search','connection_request'] : []")
    expect(action).toContain("requirePublicAccountActive: body.data.action === 'accept'")
    expect(connectionsPage).toContain('getAuthenticatedServerContext')
    expect(connectionsPage).not.toContain('hasBetaFeatureAccess')
    expect(connectionsPage).not.toContain("redirect('/account')")
  })

  it('keeps one generic valid non-match browser contract and no target identity',()=>{
    expect(search).toContain("NextResponse.json({ state: 'unavailable' })")
    expect(client).toContain("unavailable: '일치 여부를 확인하지 못했습니다.'")
    for(const state of ['not_found','request_unavailable','already_requested','already_connected']) {
      expect(client).not.toContain(`${state}:`)
    }
    expect(search).not.toMatch(/receiverUserId|receiver_user_id|target_user_id/)
  })

  it('enforces same-target-school and consumes stale legitimate authority safely',()=>{
    const find = rpc('find_exact_private_profile_match','create_connection_request')
    const create = rpc('create_connection_request','remind_connection_request')
    expect(find).toMatch(/actor_membership\.owner_user_id = actor_user_id[\s\S]*actor_membership\.school_id = target_school_id/)
    expect(find).not.toMatch(/actor_membership\.graduation_year/)
    expect(create).toMatch(/target_school[\s\S]*actor_membership\.school_id = target_school/)
    expect(create).toContain('UPDATE public.connection_match_tokens SET used_at = now()')
  })

  it('makes deletion, emergency and beta features authoritative in service-only RPCs',()=>{
    const eligible = rpc('is_current_adult_account','find_exact_private_profile_match')
    expect(eligible).toContain("d.status <> 'rejected'")
    for(const name of ['find_exact_private_profile_match','create_connection_request','remind_connection_request']) {
      const section = migration.slice(migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`))
      expect(section).toContain("control.state = 'emergency_stopped'")
      expect(section).toContain("public.has_beta_feature_access(actor_user_id,'people_search')")
    }
    const accept = rpc('respond_connection_request','REVOKE ALL ON FUNCTION public.connection_text_is_safe')
    expect(accept).toContain("response_action = 'accept'")
    expect(accept).toContain("public.has_beta_feature_access(actor_user_id,'connection_request')")
    expect(accept).toContain('public.is_current_adult_account(req.sender_user_id)')
    expect(accept).toContain('public.is_current_adult_account(req.receiver_user_id)')
  })

  it('keeps safety closure outside feature/emergency checks and gates Instagram GET first',()=>{
    const respond = rpc('respond_connection_request','REVOKE ALL ON FUNCTION public.connection_text_is_safe')
    expect(respond.indexOf("IF response_action = 'accept'")).toBeLessThan(respond.indexOf("next_status := CASE response_action"))
    expect(respond.slice(respond.indexOf("next_status := CASE response_action"))).not.toContain('has_beta_feature_access')
    const get = instagram.slice(instagram.indexOf('export async function GET'),instagram.indexOf('export async function POST'))
    expect(get).toContain("requireConnectionContext(request, 'instagram')")
    expect(get.indexOf("requireConnectionContext(request, 'instagram')")).toBeLessThan(get.indexOf('getConversation('))
  })

  it('retains service-role-only execute authority after replacement',()=>{
    for(const signature of [
      'is_current_adult_account(uuid)','find_exact_private_profile_match(uuid,uuid,integer,text)',
      'create_connection_request(uuid,uuid,text,text)','remind_connection_request(uuid,uuid)',
      'respond_connection_request(uuid,uuid,text,text)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated`)
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`)
    }
  })

  it('keeps the expanded Korean-provider and handle-terminator corpus in both TS and SQL verification',()=>{
    for(const value of [
      '카카오 아이디 friend12','인스타 아이디 friend12',
      '@friend,','@friend.','@friend!','@friend?',
    ]) {
      expect(safetyTest).toContain(value)
      expect(disposableAudit).toContain(value)
    }
    for(const value of ['나 완이야. 오랜만이야.','우리 3학년 2반이었지?','우리 @ 기호도 썼었지.']) {
      expect(safetyTest).toContain(value)
      expect(disposableAudit).toContain(value)
    }
  })
})
