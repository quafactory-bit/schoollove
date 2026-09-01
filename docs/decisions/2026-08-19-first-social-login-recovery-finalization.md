# PHASE 10P — first social login recovery and downstream finalization

Status: local implementation for Draft review; Preview deployment, migration apply, credentials, email delivery, and live provider login are not part of this change.

## Callback and continuity

- A verified upstream callback returns only a server-internal outcome, trusted attempt authority, authentication time, and derived broker subject.
- `EXISTING_PRIMARY` is finalized immediately to the exact registered Preview Supabase callback.
- `RECOVERY_REQUIRED` issues no broker code. It rotates into an encrypted `__Host-` HttpOnly, Secure, SameSite=Lax cookie with a maximum ten-minute lifetime and redirects to `/auth/social/recovery`.
- Attempt, account, transaction, provider, and broker-subject authority are never accepted from query parameters or form bodies. Private identifiers in the recovery/completion cookie are authenticated ciphertext and are never browser-readable in raw form.

## Recovery and delivery

- The existing exact-preservation recovery-email canonicalization, versioned HMAC, account-bound AES-256-GCM ciphertext, eight-digit CSPRNG OTP, OTP MAC, durable reservation, expiry, lock, and failure budgets remain authoritative.
- The database reservation happens before external delivery. The Resend transport uses a purpose-bound digest of the reserved delivery UUID as its deterministic idempotency key. A transport failure terminalizes the reservation and is never automatically retried.
- Email content contains only the SchoolLove recovery purpose, the eight-digit OTP, the short expiry, and a non-sharing warning.

Required Preview-only server slots:

- `SCHOOLLOVE_RECOVERY_EMAIL_HMAC_KEY_V1`
- `SCHOOLLOVE_RECOVERY_EMAIL_ENCRYPTION_KEY_V1`
- `SCHOOLLOVE_RECOVERY_OTP_MAC_KEY_V1`
- `SCHOOLLOVE_RECOVERY_RESEND_API_KEY`
- `SCHOOLLOVE_RECOVERY_EMAIL_FROM`

The three recovery keys must each decode to a distinct 32-byte key and must also differ from every broker, browser, PKCE, nonce, and subject key. No recovery key is derived from a provider secret, OIDC signing key, or Supabase credential.

## First-user downstream ordering

The earlier issuance contract required `auth_principal_bound` before a broker code, while a real Supabase Custom OIDC user does not exist until after that code is exchanged. The forward-only migration closes that cycle without weakening recovery:

1. `ACCOUNT_DECIDED` is reachable only after sent-delivery and valid-OTP recovery checks.
2. A transaction-bound code may be issued for that exact provisional/unbound account and identity, with the existing verified-leg, exact client/redirect, S256, nonce/state, and single-use checks unchanged.
3. Supabase consumes the code and creates or resolves its authenticated OIDC identity.
4. `/auth/social/complete` validates the real Supabase access token and requires its identity `sub` to equal the broker subject held in encrypted server continuity.
5. The service-only bind RPC derives the account exclusively from the consumed attempt and accepts only the same Supabase `auth.identities` subject. Same-user replay is idempotent; a different user or subject is rejected.

The account remains provisional while the public launch is closed. This phase does not call the existing launch-gated activation RPC and does not expose social buttons.
