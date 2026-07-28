import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const search = read('app/api/connections/search/route.ts')
const requests = read('app/api/connections/requests/route.ts')
const requestAction = read('app/api/connections/requests/[id]/route.ts')
const reminder = read('app/api/connections/requests/[id]/reminder/route.ts')
const messages = read('app/api/connections/[id]/messages/route.ts')
const instagram = read('app/api/connections/[id]/instagram/route.ts')
const report = read('app/api/connections/[id]/report/route.ts')
const service = read('lib/connections.ts')

describe('PHASE 10C connection API boundaries', () => {
  it.each([
    ['search', search], ['requests', requests], ['request action', requestAction],
    ['reminder', reminder], ['messages', messages], ['instagram', instagram], ['report', report],
  ])('%s는 body보다 먼저 검증된 session context를 요구한다', (_name, source) => {
    const authIndex = source.indexOf('requireConnectionContext(request')
    const bodyIndex = source.indexOf('readJson(request)')
    expect(authIndex).toBeGreaterThanOrEqual(0)
    if (bodyIndex >= 0) expect(authIndex).toBeLessThan(bodyIndex)
  })

  it('검색 응답은 receiver ID·목록·개수를 반환하지 않고 opaque token만 반환한다', () => {
    expect(search).toContain('matchToken')
    expect(search).not.toMatch(/receiverUserId|receiver_user_id|results|count/)
    expect(service).toContain("rpc('find_exact_private_profile_match'")
    expect(service).not.toMatch(/findExactConnectionMatch[\s\S]*\.ilike\(/)
  })

  it('모든 mutation은 session user ID를 service-role 전용 원자 RPC actor로 사용한다', () => {
    for (const rpc of [
      'create_connection_request', 'remind_connection_request', 'respond_connection_request',
      'send_connection_message', 'disconnect_connection', 'report_connection_safety',
      'set_connection_instagram_permission',
    ]) expect(service).toContain(`'${rpc}'`)
    expect(service).toContain('actor_user_id: input.userId')
    expect(requests).not.toMatch(/user_id|receiver_user_id|sender_user_id/)
  })

  it('안부·연결·대화 목록은 검증된 현재 사용자 범위만 조회하고 상대 UUID를 응답 모델에서 제거한다', () => {
    expect(service).toContain('.or(`sender_user_id.eq.${userId},receiver_user_id.eq.${userId}`)')
    expect(service).toContain('.or(`user_low_id.eq.${userId},user_high_id.eq.${userId}`)')
    expect(service).toContain('mine: message.sender_user_id === userId')
    expect(service).not.toMatch(/return \{[^}]*receiver_user_id/)
  })

  it('검색·안부·재알림·대화·Instagram·신고에 rate limit action을 적용한다', () => {
    expect(search).toContain("'search'")
    expect(requests).toContain("'request'")
    expect(reminder).toContain("'reminder'")
    expect(messages).toContain("'message'")
    expect(instagram).toContain("'instagram'")
    expect(report).toContain("'report'")
  })
})
