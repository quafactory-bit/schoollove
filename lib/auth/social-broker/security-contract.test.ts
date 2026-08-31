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

  it('keeps the broker server-only, permits only the fixed Google entrypoint, and disconnects it from Supabase and network clients', () => {
    const index = read('lib/auth/social-broker/index.ts')
    const providers = read('lib/auth/social-broker/providers.ts')
    const oidc = read('lib/auth/social-broker/oidc.ts')
    const appSources = sourceFiles(join(ROOT, 'app')).map((path) => readFileSync(path, 'utf8')).join('\n')

    expect(index).toContain("import 'server-only'")
    expect(`${providers}\n${oidc}`).not.toMatch(/\bfetch\s*\(|axios|https?\.request|@supabase|Supabase|getSupabase/i)
    expect(appSources).toContain('darkOidcRouteNotFound')
    expect(read('lib/auth/social-broker/http.ts')).toContain("import 'server-only'")
    expect(read('lib/auth/social-broker/http.ts')).toContain('return new Response(null, { status: 404')
    const login = read('app/login/page.tsx')
    const googleStart = read('app/auth/social/start/google/route.ts')
    const googleCallback = read('app/auth/social/callback/google/route.ts')
    expect(login).toContain('href="/auth/social/start/google"')
    expect(login).toContain('Google로 계속하기')
    expect(login).toContain('loadUserLoginBrokerConfig() !== null')
    expect(login).not.toMatch(/kakao|naver/i)
    expect(googleStart).toContain("custom:schoollove-google")
    expect(googleStart).toContain("destination.searchParams.set('redirect_to', config.completionRoute)")
    expect(googleStart).toContain('new URL(request.url).origin !== config.issuer')
    expect(googleStart).not.toMatch(/headers\.get|searchParams\.get/)
    expect(googleStart).toContain('loadUserLoginBrokerConfig()')
    expect(googleCallback).toContain('loadUserLoginBrokerConfig()')
    expect(read('app/auth/social/complete/page.tsx')).toContain('loadUserLoginBrokerConfig()')
    expect(read('lib/auth/social-broker/preview-recovery-http.ts')).toContain('loadUserLoginBrokerConfig()')
    expect(read('app/oauth/authorize/route.ts')).toContain('loadUserLoginBrokerConfig()')
    expect(read('app/oauth/token/route.ts')).toContain('loadUserLoginBrokerConfig()')
    expect(read('app/api/auth/request-otp/route.ts')).not.toContain('social-broker')
    expect(read('app/api/auth/verify-otp/route.ts')).not.toContain('social-broker')
    for (const route of [
      'app/auth/social/callback/google/route.ts', 'app/auth/social/callback/kakao/route.ts', 'app/auth/social/callback/naver/route.ts',
      'app/.well-known/openid-configuration/route.ts', 'app/.well-known/jwks.json/route.ts', 'app/oauth/authorize/route.ts', 'app/oauth/token/route.ts',
    ]) expect(read(route)).toContain('darkOidcRouteNotFound')
    for (const route of ['app/auth/social/callback/kakao/route.ts', 'app/auth/social/callback/naver/route.ts']) {
      expect(read(route)).not.toMatch(/activeBrokerRouteAdapter|upstream-adapters/)
    }
  })

  it('keeps dark upstream adapters server-only, transport-injected, and outside the public HTTP surface', () => {
    const upstream = read('lib/auth/social-broker/upstream-adapters.ts')
    const appSources = sourceFiles(join(ROOT, 'app')).map((path) => readFileSync(path, 'utf8')).join('\n')

    expect(upstream).toContain("import 'server-only'")
    expect(upstream).toContain('interface UpstreamProviderAdapter')
    expect(upstream).toContain('type UpstreamHttpTransport')
    expect(upstream).not.toMatch(/\bfetch\s*\(|axios|https?\.request|undici|@supabase|Supabase|getSupabase|process\.env|cookie|localStorage|sessionStorage|redis|writeFile/i)
    expect(appSources).not.toContain('upstream-adapters')
  })

  it('contains no recovery email or identity PII fields in the provider-neutral type contract', () => {
    const types = read('lib/auth/social-broker/types.ts')
    expect(types).not.toMatch(/email_verified|nickname|picture|birthday|gender|phone|recoveryEmail/)
  })
})
