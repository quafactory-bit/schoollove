import { createPublicKey, verify, type JsonWebKey as NodeJsonWebKey } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SocialBrokerError } from './errors'
import { FakeBrokerOidcIssuer, pkceChallengeForAuthorization } from './oidc'
import { createPkceVerifier } from './pkce'
import { deriveBrokerSubject } from './subject'

const NOW = 1_800_000_000
const CLIENT_ID = 'supabase-social-broker'
const REDIRECT_URI = 'https://auth.schoollove.invalid/callback'
const syntheticKey = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)
const subject = deriveBrokerSubject({
  provider: 'google',
  upstreamSubject: Buffer.from('synthetic-google-subject', 'utf8'),
  keyVersion: 'k01',
  key: syntheticKey,
})
const issuer = () => new FakeBrokerOidcIssuer({
  issuer: 'https://broker.schoollove.invalid',
  clients: [{ clientId: CLIENT_ID, redirectUris: [REDIRECT_URI] }],
})

function issueCode(server: FakeBrokerOidcIssuer, verifier = createPkceVerifier(), issuedAt = NOW) {
  return {
    verifier,
    code: server.issueAuthorizationCode({
      subject,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      codeChallenge: pkceChallengeForAuthorization(verifier),
      codeChallengeMethod: 'S256',
      issuedAt,
      authenticationTime: issuedAt - 5,
    }),
  }
}

function verifyRs256(idToken: string, publicJwk: Record<string, unknown>): boolean {
  const parts = idToken.split('.')
  if (parts.length !== 3) return false
  const publicKey = createPublicKey({ key: publicJwk as NodeJsonWebKey, format: 'jwk' })
  return verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii'),
    publicKey,
    Buffer.from(parts[2], 'base64url'),
  )
}

describe('local-only fake broker OIDC issuer contract', () => {
  it('publishes discovery and public-only JWKS representations', () => {
    const server = issuer()
    expect(server.discovery()).toEqual({
      issuer: 'https://broker.schoollove.invalid',
      authorization_endpoint: 'https://broker.schoollove.invalid/authorize',
      token_endpoint: 'https://broker.schoollove.invalid/token',
      jwks_uri: 'https://broker.schoollove.invalid/.well-known/jwks.json',
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
    })
    expect(server.jwks().keys).toHaveLength(1)
    const publicJwk = server.jwks().keys[0]
    expect(publicJwk).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' })
    expect(publicJwk.kid).toMatch(/^fake-[0-9a-f]{16}$/)
    for (const privateParameter of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
      expect(publicJwk).not.toHaveProperty(privateParameter)
    }
  })

  it('issues a single-use, client/redirect/PKCE-bound 60-second code and minimal ID token', () => {
    const server = issuer()
    const { code, verifier } = issueCode(server)
    const token = server.exchangeAuthorizationCode({
      code,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier,
      now: NOW + 10,
    })
    const claims = server.decodeIdTokenClaims(token.idToken)
    const publicJwk = server.jwks().keys[0]
    const protectedHeader = JSON.parse(Buffer.from(token.idToken.split('.')[0], 'base64url').toString('utf8'))
    expect(server.codeTtlSeconds).toBe(60)
    expect(server.idTokenTtlSeconds).toBe(300)
    expect(token).not.toHaveProperty('refreshToken')
    expect(protectedHeader).toEqual({ alg: 'RS256', typ: 'JWT', kid: publicJwk.kid })
    expect(verifyRs256(token.idToken, publicJwk)).toBe(true)
    expect(verifyRs256(token.idToken, issuer().jwks().keys[0])).toBe(false)
    expect(Object.keys(claims).sort()).toEqual(['aud', 'auth_time', 'exp', 'iat', 'iss', 'sub'])
    expect(claims).toMatchObject({ iss: server.issuer, aud: CLIENT_ID, sub: subject, auth_time: NOW - 5 })
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300)
    expect(JSON.stringify(claims)).not.toMatch(/email|name|nickname|picture|phone|recovery|upstream/i)
    expect(() => server.exchangeAuthorizationCode({
      code,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier,
      now: NOW + 11,
    })).toThrowError(new SocialBrokerError('REPLAY_REJECTED'))
  })

  it('rejects expiry, wrong redirect URI, wrong client ID, verifier mismatch, and PKCE plain', () => {
    const expiredServer = issuer()
    const expired = issueCode(expiredServer)
    expect(() => expiredServer.exchangeAuthorizationCode({
      code: expired.code, clientId: CLIENT_ID, redirectUri: REDIRECT_URI,
      codeVerifier: expired.verifier, now: NOW + 60,
    })).toThrowError(new SocialBrokerError('AUTHORIZATION_CODE_EXPIRED'))

    const redirectServer = issuer()
    const redirect = issueCode(redirectServer)
    expect(() => redirectServer.exchangeAuthorizationCode({
      code: redirect.code, clientId: CLIENT_ID, redirectUri: `${REDIRECT_URI}/wrong`,
      codeVerifier: redirect.verifier, now: NOW + 1,
    })).toThrowError(new SocialBrokerError('REDIRECT_URI_REJECTED'))

    const clientServer = issuer()
    const client = issueCode(clientServer)
    expect(() => clientServer.exchangeAuthorizationCode({
      code: client.code, clientId: 'wrong-client', redirectUri: REDIRECT_URI,
      codeVerifier: client.verifier, now: NOW + 1,
    })).toThrowError(new SocialBrokerError('UNKNOWN_CLIENT'))

    const verifierServer = issuer()
    const verifier = issueCode(verifierServer)
    expect(() => verifierServer.exchangeAuthorizationCode({
      code: verifier.code, clientId: CLIENT_ID, redirectUri: REDIRECT_URI,
      codeVerifier: createPkceVerifier(), now: NOW + 1,
    })).toThrowError(new SocialBrokerError('PKCE_REJECTED'))

    const downgradeServer = issuer()
    const pkceVerifier = createPkceVerifier()
    expect(() => downgradeServer.issueAuthorizationCode({
      subject, clientId: CLIENT_ID, redirectUri: REDIRECT_URI,
      codeChallenge: pkceChallengeForAuthorization(pkceVerifier), codeChallengeMethod: 'plain',
      issuedAt: NOW, authenticationTime: NOW,
    })).toThrowError(new SocialBrokerError('PKCE_DOWNGRADE_REJECTED'))
  })

  it('allows exactly one concurrent authorization-code consume', async () => {
    const server = issuer()
    const { code, verifier } = issueCode(server)
    const consume = () => Promise.resolve().then(() => server.exchangeAuthorizationCode({
      code, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, codeVerifier: verifier, now: NOW + 1,
    }))
    const results = await Promise.allSettled([consume(), consume(), consume()])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2)
  })
})
