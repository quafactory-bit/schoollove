import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LoginAttempt } from './attempt'
import { createBrokerLogEvent, serializeBrokerLogEvent } from './logging'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

function sourceFiles(root: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(path))
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) found.push(path)
  }
  return found
}

describe('social broker security and feature-off contract', () => {
  it('serializes only whitelisted safe log fields', () => {
    const attempt = new LoginAttempt({
      id: 'att_1234567890abcdef', provider: 'kakao', createdAt: 1_800_000_000, expiresAt: 1_800_000_300,
    })
    const output = serializeBrokerLogEvent(createBrokerLogEvent({
      event: 'attempt_created', attempt: attempt.snapshot(), at: 1_800_000_000,
    }))
    const forbidden = [
      'raw-upstream-subject', 'raw-state-value', 'raw-nonce-value', 'pkce-verifier-value',
      'authorization-code-value', 'token-value', 'access-token-value', 'supabase-facing-nonce-value',
      'Recovery.Local+tag@xn--example.invalid',
      'provider-response-body', 'code=callback-query',
    ]
    for (const secret of forbidden) expect(output).not.toContain(secret)
    expect(Object.keys(JSON.parse(output)).sort()).toEqual(['at', 'attemptId', 'event', 'provider', 'state'])
  })

  it('keeps the broker server-only, route-free, and disconnected from Supabase and network clients', () => {
    const index = read('lib/auth/social-broker/index.ts')
    const providers = read('lib/auth/social-broker/providers.ts')
    const oidc = read('lib/auth/social-broker/oidc.ts')
    const appSources = sourceFiles(join(ROOT, 'app')).map((path) => readFileSync(path, 'utf8')).join('\n')

    expect(index).toContain("import 'server-only'")
    expect(`${providers}\n${oidc}`).not.toMatch(/\bfetch\s*\(|axios|https?\.request|@supabase|Supabase|getSupabase/i)
    expect(appSources).not.toContain('social-broker')
    expect(read('app/login/page.tsx')).not.toMatch(/kakao|naver|google|social-broker/i)
    expect(read('app/api/auth/request-otp/route.ts')).not.toContain('social-broker')
    expect(read('app/api/auth/verify-otp/route.ts')).not.toContain('social-broker')
  })

  it('contains no recovery email or identity PII fields in the provider-neutral type contract', () => {
    const types = read('lib/auth/social-broker/types.ts')
    expect(types).not.toMatch(/email_verified|nickname|picture|birthday|gender|phone|recoveryEmail/)
  })
})
