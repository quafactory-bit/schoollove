# PHASE 10O-J — Durable broker authorization-code boundary

Date: 2026-08-11
Status: Draft, feature-off, local/disposable-DB verified only

## Decision

The fake in-memory OIDC issuer remains a test-only interoperability harness. The future broker's opaque authorization-code lifecycle is instead represented by a new private, service-only durable boundary. This decision does not expose an authorization endpoint, token endpoint, discovery document, JWKS, public route, login UI, provider adapter, Supabase Custom OIDC configuration, or production signing key.

## Durable code contract

- A raw authorization code is exactly 256 bits from Node CSPRNG and base64url without padding (43 characters). It exists only in the ephemeral server response immediately after preparation.
- The database stores only `SHA-256("schoollove:broker-authorization-code:v1\\0" || raw-code)` as a 32-byte digest. It never stores a raw code, code verifier, raw nonce, upstream token, email, name, profile data, or broker subject in the code row.
- Codes expire in at most 60 seconds, are bound to exact `client_id`, exact `redirect_uri`, and an exact 43-character S256 PKCE challenge, and are one-time.
- A code can be issued only from `auth_principal_bound` or `existing_primary`; the attempt becomes `broker_code_ready`. `existing_account_match` and `account_decided` before Auth-principal binding cannot issue a code.
- Exchange supplies a digest and a server-computed S256 challenge, not a raw code/verifier to SQL. A successful exchange transitions code `ready → consumed` and attempt `broker_code_ready → consumed` exactly once.
- Unknown code values do not mutate state. Expiry and binding/PKCE failures persist `expired` or `rejected` terminal code state and return coarse outcomes; they do not `RAISE` after mutation, so the terminal transition is committed. Subsequent exchanges return `REPLAY_REJECTED`.

## Durable downstream nonce contract

Upstream nonce verification remains the existing digest-only upstream rule. The downstream Supabase-facing authorization nonce needs exact later echo in an ID token, so its durable representation is separately encrypted with an injected broker-code nonce key. It is not a recovery-email key and no production key/env/KMS is introduced in this phase.

- Nonce digest: `SHA-256("schoollove:broker-code-downstream-nonce-digest:v1\\0" || exact UTF-8 nonce)`.
- AES-256-GCM AAD is framed `schoollove:broker-code-downstream-nonce:v1`, code-record UUID, exact client ID, exact redirect URI, and nonce-encryption key version.
- The nullable digest/ciphertext/IV/key-version tuple is all-null when nonce is absent and all-non-null when present. The IV is 12 bytes; ciphertext contains the 16-byte GCM tag.
- Only the successful server-side exchange path may decrypt it. Wrong key/version/code UUID/client/redirect or ciphertext/IV/AAD tampering fails closed.

## Data and permission boundary

`private.broker_authorization_codes` has RLS and FORCE RLS. Direct CRUD is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`; only the two fixed service-role RPC signatures have EXECUTE. The migration is forward-only and is not applied to Production in PHASE 10O-J.

## Explicit exclusions

No provider network call, real OAuth, actual email/OTP, Auth user outside disposable test data, public route, `/login` change, middleware change, environment variable, Production migration, Production DB write, signing-key custody, provider configuration, or launch-state change is authorized here.
