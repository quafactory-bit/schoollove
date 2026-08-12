import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { brokerAuthorizationCodeDigest, encryptBrokerDownstreamNonce } from './durable-code'
import { DarkOidcHttpIssuer, createSyntheticClient, darkOidcRouteNotFound, type DarkOidcRegistry } from './http'
import { calculateS256Challenge, createPkceVerifier } from './pkce'
import { GET as discoveryGet } from '@/app/.well-known/openid-configuration/route'
import { GET as jwksGet } from '@/app/.well-known/jwks.json/route'
import { GET as authorizeGet } from '@/app/oauth/authorize/route'
import { POST as tokenPost } from '@/app/oauth/token/route'

const issuer = 'https://broker.schoollove.invalid'
const redirect = 'https://local.supabase.invalid/auth/v1/callback'
const nonceKey = { version: 1, material: Buffer.alloc(32, 7) }
const clients = [
  createSyntheticClient('slb-supabase-kakao', 'kakao secret+/=', redirect, 'kakao'),
  createSyntheticClient('slb-supabase-naver', 'naver secret+/=', redirect, 'naver'),
  createSyntheticClient('slb-supabase-google', 'google secret+/=', redirect, 'google'),
] as const

function fixture(overrides: Partial<DarkOidcRegistry> = {}) {
  let consumeCount = 0
  let digestCount = 0
  const code = randomBytes(32).toString('base64url')
  const codeId = 'a1000000-0000-4000-8000-000000000001'
  const verifier = createPkceVerifier(); const challenge = calculateS256Challenge(verifier)
  const nonce = encryptBrokerDownstreamNonce({ nonce: 'exact-downstream-nonce', key: nonceKey, codeId, clientId: clients[2].clientId, redirectUri: redirect, iv: Buffer.alloc(12, 4) })
  const registry: DarkOidcRegistry = {
    clients, nonceKey,
    digestCode: input => { digestCount += 1; return brokerAuthorizationCodeDigest(input) },
    authorize: async () => ({ authorizationCode: 'A'.repeat(43) }),
    consumeCode: async input => { consumeCount += 1; return Buffer.from(input.codeDigest).equals(Buffer.from(brokerAuthorizationCodeDigest(code))) && input.clientId === clients[2].clientId && input.redirectUri === redirect && input.pkceS256Challenge === challenge ? { outcome: 'AUTHORIZATION_CODE_CONSUMED', subject: 'slb:v1:k01:google:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', authenticationTime: 1_800_000_000, codeId, downstreamNonce: nonce } : null },
    ...overrides,
  }
  const service = new DarkOidcHttpIssuer({ issuer, registry })
  return { service, code, verifier, get consumeCount() { return consumeCount }, get digestCount() { return digestCount } }
}

describe('dark OIDC HTTP boundary', () => {
  it('binds three static Supabase clients to exactly one provider on one issuer', async () => {
    const f = fixture(); const metadata = f.service.discovery()
    expect(metadata).toMatchObject({ issuer, token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'], id_token_signing_alg_values_supported: ['RS256'] })
    for (const client of clients) {
      const response = await f.service.authorizeRequest(new Request(`${issuer}/oauth/authorize?response_type=code&client_id=${client.clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=state-${client.provider}&scope=openid&code_challenge=${'A'.repeat(43)}&code_challenge_method=S256`))
      expect(response.status).toBe(302)
      const location = new URL(response.headers.get('location')!)
      expect(location.origin + location.pathname).toBe(redirect)
      expect(location.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    }
    const rejected = await f.service.authorizeRequest(new Request(`${issuer}/oauth/authorize?response_type=code&client_id=${clients[2].clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=x&scope=openid&code_challenge=${'A'.repeat(43)}&code_challenge_method=S256&provider=kakao`))
    expect(rejected.status).toBe(400)
  })

  it('PHASE10O_K_AUTHORIZE_EXACT_REDIRECT_ONLY_OK and PHASE10O_K_AUTHORIZE_STATE_EXACT_ECHO_OK', async () => {
    const f = fixture({ authorize: async () => ({ authorizationCode: 'Z'.repeat(43) }) })
    const state = 'state +/%?&= 한글'
    const response = await f.service.authorizeRequest(new Request(`${issuer}/oauth/authorize?response_type=code&client_id=${clients[2].clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}&scope=openid&code_challenge=${'A'.repeat(43)}&code_challenge_method=S256`))
    const location = new URL(response.headers.get('location')!)
    expect(response.status).toBe(302)
    expect(location.origin + location.pathname).toBe(redirect)
    expect(location.searchParams.get('code')).toBe('Z'.repeat(43))
    expect(location.searchParams.get('state')).toBe(state)
  })

  it('rejects an adapter authorization code outside the exact 43-character base64url contract', async () => {
    const f = fixture({ authorize: async () => ({ authorizationCode: 'not-a-durable-code' }) })
    const response = await f.service.authorizeRequest(new Request(`${issuer}/oauth/authorize?response_type=code&client_id=${clients[2].clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=x&scope=openid&code_challenge=${'A'.repeat(43)}&code_challenge_method=S256`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'server_error' })
  })

  it('handles Go QueryEscape-compatible Basic decoding exactly once and exchanges a durable code', async () => {
    const f = fixture()
    const basic = Buffer.from('slb-supabase-google:google+secret%2B%2F%3D', 'utf8').toString('base64')
    const response = await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` }, body: new URLSearchParams({ grant_type: 'authorization_code', code: f.code, redirect_uri: redirect, code_verifier: f.verifier }) }))
    expect(response.status).toBe(200); expect(f.consumeCount).toBe(1); expect(f.digestCount).toBe(1)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 60 })
    expect(String(body.id_token).split('.')).toHaveLength(3)
    expect(JSON.parse(Buffer.from(String(body.id_token).split('.')[1], 'base64url').toString('utf8'))).toMatchObject({ iss: issuer, aud: clients[2].clientId, nonce: 'exact-downstream-nonce' })
  })

  it('accepts exactly one post credential mechanism', async () => {
    const f = fixture()
    const response = await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: f.code, redirect_uri: redirect, code_verifier: f.verifier, client_id: clients[2].clientId, client_secret: 'google secret+/=' }) }))
    expect(response.status).toBe(200); expect(f.consumeCount).toBe(1); expect(f.digestCount).toBe(1)
  })

  it('rejects bad and dual credentials before durable code consume', async () => {
    const f = fixture(); const body = new URLSearchParams({ grant_type: 'authorization_code', code: f.code, redirect_uri: redirect, code_verifier: f.verifier, client_id: clients[2].clientId, client_secret: 'wrong' })
    expect((await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }))).status).toBe(401)
    expect(f.consumeCount).toBe(0); expect(f.digestCount).toBe(0)
    const dual = await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from('slb-supabase-google:google+secret%2B%2F%3D').toString('base64')}` }, body }))
    expect(dual.status).toBe(401); expect(f.consumeCount).toBe(0); expect(f.digestCount).toBe(0)
    const neither = await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: f.code, redirect_uri: redirect, code_verifier: f.verifier }) }))
    expect(neither.status).toBe(401); expect(f.consumeCount).toBe(0); expect(f.digestCount).toBe(0)
    const unknown = await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: f.code, redirect_uri: redirect, code_verifier: f.verifier, client_id: 'unknown', client_secret: 'secret' }) }))
    expect(unknown.status).toBe(401); expect(f.consumeCount).toBe(0); expect(f.digestCount).toBe(0)
    const duplicateSecret = await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=authorization_code&code=${f.code}&redirect_uri=${encodeURIComponent(redirect)}&code_verifier=${f.verifier}&client_id=${clients[2].clientId}&client_secret=a&client_secret=b` }))
    expect(duplicateSecret.status).toBe(400); expect(f.consumeCount).toBe(0); expect(f.digestCount).toBe(0)
    const malformed = await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic !!!' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: f.code, redirect_uri: redirect, code_verifier: f.verifier }) }))
    expect(malformed.status).toBe(401); expect(f.consumeCount).toBe(0); expect(f.digestCount).toBe(0)
    const duplicate = await f.service.authorizeRequest(new Request(`${issuer}/oauth/authorize?response_type=code&response_type=code&client_id=${clients[2].clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=x&scope=openid&code_challenge=${'A'.repeat(43)}&code_challenge_method=S256`))
    expect(duplicate.status).toBe(400)
  })

  it('PHASE10O_K_TOKEN_CONTENT_TYPE_EXACT_OK and PHASE10O_K_TOKEN_CONTENT_TYPE_PARAMETERS_FAIL_CLOSED_OK accept only the exact form media type and UTF-8 charset', async () => {
    const f = fixture()
    const request = (contentType: string) => new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': contentType }, body: new URLSearchParams({ grant_type: 'authorization_code', code: f.code, redirect_uri: redirect, code_verifier: f.verifier, client_id: clients[2].clientId, client_secret: 'google secret+/=' }) })
    expect((await f.service.tokenRequest(request('application/x-www-form-urlencoded; charset=UTF-8'))).status).toBe(200)
    expect((await f.service.tokenRequest(request('application/x-www-form-urlencoded; Charset=utf-8'))).status).toBe(200)
    expect((await f.service.tokenRequest(request('application/x-www-form-urlencodedevil'))).status).toBe(400)
    expect((await f.service.tokenRequest(request('application/x-www-form-urlencoded; evil=yes'))).status).toBe(400)
    expect((await f.service.tokenRequest(request('application/x-www-form-urlencoded; charset=UTF-8; evil=yes'))).status).toBe(400)
    expect((await f.service.tokenRequest(request('application/x-www-form-urlencoded; charset=UTF-8; charset=UTF-8'))).status).toBe(400)
    expect((await f.service.tokenRequest(request('application/x-www-form-urlencoded; charset'))).status).toBe(400)
  })

  it('rejects malformed registry entries before HTTP handling', () => {
    expect(() => fixture({ clients: [{ ...clients[0], secretDigest: Buffer.alloc(31) }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'https://user:password@local.supabase.invalid/callback' }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'https://local.supabase.invalid/callback#fragment' }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'https://local.supabase.invalid/callback?code=reserved' }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
  })

  it('PHASE10O_K_REDIRECT_SCHEME_FAIL_CLOSED_OK permits HTTPS and loopback HTTP only', () => {
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'https://local.supabase.invalid/callback' }] })).not.toThrow()
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'http://localhost/callback' }] })).not.toThrow()
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'http://127.0.0.1/callback' }] })).not.toThrow()
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'http://[::1]/callback' }] })).not.toThrow()
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'http://evil.example/callback' }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'javascript:alert(1)' }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'data:text/plain,nope' }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'ftp://example.invalid/callback' }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
    expect(() => fixture({ clients: [{ ...clients[0], redirectUri: 'file:///callback' }] })).toThrow('OIDC_CLIENT_REGISTRY_INVALID')
  })

  it('PHASE10O_K_TOKEN_INTERNAL_ERROR_COARSE_OK and PHASE10O_K_AUTHORIZE_INTERNAL_ERROR_COARSE_OK never expose adapter errors', async () => {
    const authorize = fixture({ authorize: async () => { throw new Error('private_table_constraint_detail') } })
    const authorizeResponse = await authorize.service.authorizeRequest(new Request(`${issuer}/oauth/authorize?response_type=code&client_id=${clients[2].clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=x&scope=openid&code_challenge=${'A'.repeat(43)}&code_challenge_method=S256`))
    expect(authorizeResponse.status).toBe(500)
    expect(await authorizeResponse.json()).toEqual({ error: 'server_error' })
    const token = fixture({ consumeCode: async () => { throw new Error('SQLSTATE 23505 private_accounts') } })
    const tokenResponse = await token.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: token.code, redirect_uri: redirect, code_verifier: token.verifier, client_id: clients[2].clientId, client_secret: 'google secret+/=' }) }))
    expect(tokenResponse.status).toBe(500)
    expect(await tokenResponse.json()).toEqual({ error: 'server_error' })
  })

  it('PHASE10O_K_CRYPTO_ERRORS_COARSE_OK returns only server_error for nonce decryption failure', async () => {
    const f = fixture({ consumeCode: async () => ({ outcome: 'AUTHORIZATION_CODE_CONSUMED', subject: 'slb:v1:k01:google:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', authenticationTime: 1_800_000_000, codeId: 'a1000000-0000-4000-8000-000000000001', downstreamNonce: { digest: Buffer.alloc(32), ciphertext: Buffer.alloc(17), iv: Buffer.alloc(12), keyVersion: 1 } }) })
    const response = await f.service.tokenRequest(new Request(`${issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: f.code, redirect_uri: redirect, code_verifier: f.verifier, client_id: clients[2].clientId, client_secret: 'google secret+/=' }) }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'server_error' })
  })

  it('PHASE10O_K_PRODUCTION_HTTP_SURFACE_404_OK: keeps every deployed protocol route hard-off', async () => {
    expect(darkOidcRouteNotFound().status).toBe(404)
    expect(discoveryGet().status).toBe(404)
    expect(jwksGet().status).toBe(404)
    expect(authorizeGet().status).toBe(404)
    expect(tokenPost().status).toBe(404)
  })
})
