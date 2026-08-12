# PHASE 10O-K — Dark OIDC HTTP interoperability boundary

Date: 2026-08-12
Status: Draft implementation; Production feature-off

## Pinned interoperability evidence

- Supabase Auth source reviewed for this phase is pinned to commit `713a0d9e37a0a12b9d0e97d8b9919addffa2356e`.
- The Custom OIDC implementation is `internal/api/provider/custom_oauth.go`. Its provider record has a unique `identifier`; `issuer` is not unique. The exact same issuer may therefore be used by separately registered Custom OIDC providers. The exact `20260219120000_add_custom_oauth_providers.up.sql` migration was applied to disposable PostgreSQL and accepted three distinct synthetic `custom:schoollove-*` OIDC rows with one synthetic HTTPS issuer; a duplicate identifier was rejected, while no issuer unique constraint existed.
- The pinned dependency set contains `github.com/coreos/go-oidc/v3 v3.20.0` and `golang.org/x/oauth2 v0.36.0`.
- The provider endpoint path has no explicit OAuth2 client-auth style. A disposable actual-HTTP harness pinned to `x/oauth2 v0.36.0` observed one successful `client_secret_basic` request, exact single QueryEscape restoration of synthetic credentials, and one Basic-failure-to-`client_secret_post` retry. This is a pinned local interoperability fact, not an assumption that hosted Supabase will remain on that source revision. Production enable requires a separate hosted verification.

The full internal Supabase Auth admin suite did not run to completion because of a 300-second compile-time environment limitation. It is deliberately not represented as hosted interoperability evidence; the exact migration PostgreSQL acceptance and pinned wire harness are the local, bounded evidence for this Draft only.

## Provider selection is static, not query-controlled

One SchoolLove issuer has exactly three future Supabase Custom OIDC registrations:

| Supabase identifier | exact broker client ID | fixed upstream provider |
| --- | --- | --- |
| `custom:schoollove-kakao` | `slb-supabase-kakao` | `kakao` |
| `custom:schoollove-naver` | `slb-supabase-naver` | `naver` |
| `custom:schoollove-google` | `slb-supabase-google` | `google` |

Each registration has its own client secret. The broker derives the upstream provider only from the exact registered client ID. `provider`, `upstream_provider`, and `social_provider` query/body parameters are rejected; no request parameter may select or replace an upstream provider.

## Dark HTTP boundary

The local injected issuer contract exposes discovery, public JWKS, authorization, and token handlers with a configured canonical issuer. Host and `X-Forwarded-Host` never determine issuer, endpoint base, or ID-token `iss`. Registry entries require an exact 32-byte client-secret digest and a parseable redirect URI with no userinfo, fragment, or pre-existing OAuth response parameter (`code`, `state`, `error`, `error_description`, `error_uri`).

Production and deployed routes are hard-off: discovery, JWKS, `/oauth/authorize`, and `/oauth/token` return 404 and no environment flag can enable them. Local tests construct the server-only issuer directly using synthetic clients, an ephemeral RSA key, and a synthetic durable-code adapter.

Discovery advertises only `code`, public subjects, `RS256`, `authorization_code`, `S256`, and the two observed client-auth mechanisms. It does not advertise refresh tokens, UserInfo, or unsupported capabilities.

## Token exchange ordering

The token endpoint accepts only the exact `application/x-www-form-urlencoded` media type (parameters such as `charset=UTF-8` are allowed) and `authorization_code` requests. It supports exactly one of `client_secret_basic` or `client_secret_post`; missing or dual methods fail before authorization-code lookup. Basic credentials are base64-decoded, split once on the colon, then each component is URL-query-unescaped exactly once to match the pinned `x/oauth2` shape. Client secrets are verified through a domain-separated fixed-length digest using constant-time comparison; raw secrets are not logged, persisted, returned, or committed.

Only after client authentication, syntax, grant, and redirect checks does the adapter receive the durable code digest and computed S256 challenge. The authorize adapter returns only a validated 43-character authorization code; the HTTP layer itself builds the redirect from the registered URI and exact original state. On success it decrypts the code-bound downstream nonce exactly once for the minimal RS256 ID token. The token response has only a 60-second opaque access token, `Bearer`, `expires_in`, and the minimal ID token; no refresh token or identity/recovery claims are issued. Only fixed OAuth protocol errors are returned to callers. Unexpected adapter, database, or crypto errors return HTTP 500 `{ "error": "server_error" }` without internal detail.

## Explicit exclusions

No Production route, Supabase Custom OIDC registration, Production signing key/KMS, provider credential, upstream network call, email/OTP, Auth user, migration, DB data write, environment change, login UI change, or launch change is authorized by this Draft boundary.
