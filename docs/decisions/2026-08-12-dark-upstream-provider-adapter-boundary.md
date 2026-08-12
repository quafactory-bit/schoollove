# Dark upstream provider adapter boundary

Date: 2026-08-12
Status: accepted — local/Draft implementation only; Production remains hard-off

## Decision

SchoolLove Broker keeps the upstream-provider leg separate from both the application-to-Supabase leg and the Supabase-to-Broker leg.  The provider-neutral, server-only `UpstreamProviderAdapter` has exactly three responsibilities: prepare an authorization request, validate its callback, and exchange and verify the minimum upstream identity.  Its verified result is limited to `provider`, opaque `upstreamSubject`, and optional `authenticationTime`.

The adapters use an injected `UpstreamHttpTransport`.  The tracked adapter code does not call a network client directly, accept a client secret, read runtime configuration, or persist callback codes, state, nonce, PKCE material, access tokens, refresh tokens, ID tokens, profiles, or raw provider responses.  Raw values are request-memory-only.  This phase does not instantiate an adapter from an application route.

## Pinned public contract evidence

- Kakao: the current [Kakao Login REST/OIDC documentation](https://developers.kakao.com/docs/en/kakaologin/rest-api) specifies the `kauth.kakao.com` authorization, token, discovery, and JWKS endpoints used by this boundary.  Kakao is handled as OIDC.
- Google: the current [Google OpenID Connect reference](https://developers.google.com/identity/openid-connect/openid-connect) and [ID-token reference](https://developers.google.com/identity/openid-connect/reference) establish the authorization/token/JWKS direction and exact issuer allowlist.  Only `https://accounts.google.com` and legacy `accounts.google.com` are accepted; substring or host-suffix matching is forbidden.
- Naver: the official `naver/naver-openapi-guide` source is pinned at commit `9444ca79aab914686bf7f25726fc88ac56730c00`, path `ko/login/api/api.md`.  It is treated as OAuth 2.0, not OIDC.

The 2026-08-12 public, unauthenticated metadata audit confirmed the Kakao and Google configured discovery and JWKS URLs, RS256 signing keys, and no private JWK parameters.  It made no authorization, token, profile, or credential-bearing request.  Remote JSON and keys are not committed as fixtures.

## Provider contracts

Kakao and Google use `response_type=code`, the exact configured client ID and redirect URI, CSPRNG state, CSPRNG nonce, PKCE S256, and only `openid` scope.  The token response must contain an ID token.  Verification requires HTTPS configured JWKS, exact `kid`, RSA signing key, `RS256`, signature, exact permitted issuer, exact audience, `iat`, unexpired `exp`, exact nonce, and non-empty `sub`.

Naver uses `response_type=code`, the exact configured client ID and redirect URI, and CSPRNG state.  It does not acquire or validate an ID token, create a nonce, or send PKCE material because current pinned evidence does not establish a Naver PKCE contract.  The injected fake transport parses only a successful profile response with non-empty `response.id`.  A live Naver client-secret transport, including secret placement and transmission, is intentionally deferred.

Provider email, verification flags, name, nickname, picture, phone, and profile fields are never identity or linking inputs.  Broker-subject derivation remains provider namespaced, so equal upstream subject strings from different providers are distinct.  No automatic identity linking is introduced.

## Failure and exposure boundary

Callback state is exact, one-time, and provider-bound; missing, wrong, replayed, or substituted callbacks fail closed.  OIDC nonce is exact and one-time.  JWKS response size and key count are bounded, and a changed response URL, unknown key, wrong algorithm, malformed JSON/content type, or invalid signature fails closed.  Provider errors are only coarse internal outcomes: raw callback URLs, codes, tokens, subjects, provider bodies, client credentials, and stacks are not logged or surfaced.

Production stays closed and dark: public OIDC HTTP endpoints remain 404, `/login` remains email-OTP-only, social buttons remain absent, and no Kakao/Naver/Google authorization, token, profile, or credential action is enabled.  This decision introduces no migration, DB mutation, Auth configuration, environment change, email delivery, or launch-state change.
