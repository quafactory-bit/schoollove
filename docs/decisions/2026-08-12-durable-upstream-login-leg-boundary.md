# PHASE 10O-M — Durable upstream login-leg boundary

## Decision

The process-local upstream state, OIDC nonce, and PKCE verifier used by PHASE 10O-L cannot survive a browser redirect across serverless processes. PHASE 10O-M adds a feature-off, attempt-bound durable leg for that C-leg only.

- `private.upstream_login_legs` has exactly one row per `oauth_login_attempts` row. It stores a domain-separated SHA-256 state digest, an OIDC nonce digest where applicable, and an AES-256-GCM encrypted PKCE verifier. It never stores raw state, nonce, verifier, authorization code, tokens, provider profile, subject, or email.
- State uses `schoollove:upstream-state:v1\0`; nonce uses `schoollove:upstream-nonce:v1\0`; client configuration uses `schoollove:upstream-client-binding:v1\0` over provider, exact client ID, exact redirect URI, and contract version.
- The injected `UpstreamPkceVerifierKey` is separate from recovery-email and downstream-nonce key types. Its framed AAD binds purpose/version, attempt ID, preallocated leg ID, provider, client-binding digest, S256 challenge, and key version.
- Callback parsing only enforces the exact registered redirect endpoint and a single bounded opaque code/state. DB claim is authoritative. A wrong state commits `rejected` plus a safe terminal attempt; it never relies on an exception rollback.
- `pending` has state and provider-required resume material; `callback_claimed` scrubs state immediately; every terminal leg scrubs state, nonce, challenge, verifier ciphertext, IV, and key version. Claims/replays are single-winner under attempt-then-leg locking.
- The old direct `record_verified_social_identity` service execute grant is removed. Identity recording is available only through the `callback_claimed` leg-bound RPC.

## Production boundary

This is an unapplied forward migration and server-only test boundary. Production remains hard-off: no public route wiring, provider credential/configuration, provider network action, login UI change, environment change, email action, Auth mutation, or launch change is included.
