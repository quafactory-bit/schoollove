import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readRoute = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const subscribe = readRoute('app/api/push/subscribe/route.ts')
const unsubscribe = readRoute('app/api/push/unsubscribe/route.ts')
const adminTest = readRoute('app/api/admin/push/test/route.ts')

describe('push API boundaries', () => {
  it.each([subscribe, unsubscribe])('사용자 route는 body보다 먼저 검증된 session을 확인한다', (source) => {
    expect(source.indexOf('getAuthenticatedRequestContext(request)')).toBeLessThan(source.indexOf('request.json()'))
    expect(source).toContain('status: 401')
    expect(source).toContain("'Cache-Control': 'private, no-store, max-age=0'")
  })

  it('구독 저장은 service role과 검증된 session user만 사용한다', () => {
    expect(subscribe).toContain("from('push_subscriptions').upsert")
    expect(subscribe).toContain('user_id: auth.user.id')
    expect(subscribe).not.toMatch(/user_id:\s*parsed\.data/)
    expect(subscribe).not.toContain('console.')
  })

  it('해지는 현재 사용자와 제출 endpoint를 모두 제한한다', () => {
    expect(unsubscribe).toContain(".eq('user_id', auth.user.id)")
    expect(unsubscribe).toContain(".eq('endpoint', parsed.data.endpoint)")
  })

  it('관리자 테스트는 기존 관리자 session을 body보다 먼저 확인한다', () => {
    expect(adminTest.indexOf('requireAdminSession(request)')).toBeLessThan(adminTest.indexOf('request.json()'))
    expect(adminTest).toContain('sendAdminTestPush(parsed.data)')
    expect(adminTest).toContain('status: 401')
  })
})
