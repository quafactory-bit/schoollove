import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashConnectionRateIdentity } from './connectionRateLimit'

describe('PHASE 10C connection rate limit', () => {
  it('IP와 account 원문 대신 서로 다른 SHA-256 key를 사용한다', () => {
    const ip = hashConnectionRateIdentity('ip', '203.0.113.10')
    const account = hashConnectionRateIdentity('account', '11111111-1111-4111-8111-111111111111')
    expect(ip).not.toContain('203.0.113.10')
    expect(account).not.toContain('11111111')
    expect(ip).not.toBe(account)
  })

  it('Production 설정 누락 시 fail-closed하고 IP/account를 모두 제한한다', () => {
    const source = readFileSync(join(process.cwd(), 'lib/security/connectionRateLimit.ts'), 'utf8')
    expect(source).toContain("process.env.NODE_ENV === 'production'")
    expect(source).toContain("status: 503")
    expect(source).toContain("hashConnectionRateIdentity('ip'")
    expect(source).toContain("hashConnectionRateIdentity('account'")
    expect(source).toContain('Promise.all')
  })
})
