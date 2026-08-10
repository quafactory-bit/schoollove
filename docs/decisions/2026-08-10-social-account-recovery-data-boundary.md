# PHASE 10O-F — social account identity registry and recovery-data boundary

## Decision

PHASE 10O-F adds an additive, dark database boundary in the non-public `private` schema. It does not replace the established `auth.users.id` owner key used by adult eligibility, consents, private profiles, memberships, or deletion requests. No existing row is backfilled, claimed, linked, or reclassified.

`private.private_accounts` stores an immutable primary provider and opaque broker subject. `private.social_identity_registry` records only the opaque `slb:v1:<key-version>:<provider>:<digest>` subject plus internal digest/key version; it never stores an upstream raw subject, email, or profile attribute. A partial unique index permits exactly one active primary identity and verified recovery HMAC per retained account, including deletion-pending and cleanup-failed-safe states. Automatic cross-provider or email-based linking is absent.

Recovery canonicalization removes only outer ASCII whitespace, preserves the subsequent local part exactly (including case, Unicode, plus tags, and dots), and converts only the domain through IDNA ASCII then lowercase. The server-only domain layer uses distinct versioned synthetic keys for SHA-256 recovery-email HMAC, AES-256-GCM (96-bit nonce, 128-bit tag, purpose/record-bound AAD), and framed OTP HMAC-SHA-256. The database stores HMAC/ciphertext/nonce/OTP MAC only; raw email and raw OTP have no column.

`private.recovery_email_verifications` has a maximum ten-minute lifetime, five failed attempts, and terminal consumed/locked/expired/revoked states. A successful consume is single-use and applies protected recovery material atomically. Activation requires verified recovery material, a bound Auth principal, and the existing public-account launch state to be `open` with all three existing account features enabled. Production remains `closed`, and this PR adds no activation route.

Deletion revokes the registry, clears recoverable ciphertext/nonce immediately, retains the verified HMAC until Auth cleanup, and enqueues an idempotent database-only cleanup job. This PR never deletes an Auth user or sends an email.

All private tables use RLS + FORCE RLS, have no PUBLIC/anon/authenticated table grants, and are outside the PostgREST public schema. Mutation RPCs are `SECURITY DEFINER`, use an empty `search_path`, revoke PUBLIC access, and grant execute only to `service_role`. The sole authenticated RPC is a minimal owner-status projection excluding crypto, HMAC, digest, broker subject, and cleanup details.

## Verification and scope

The disposable local Supabase PostgreSQL suite exercised lifecycle, permission, and concurrent broker-subject/recovery-HMAC/challenge-consume races. It used only `example.invalid` synthetic data and removed the container afterwards. This migration is not applied to Production; no Production DB, environment, Supabase Auth setting, provider, KMS/HSM key, real email/OTP, or login UI changed.

The next phase may connect this dark registry to a reviewed server-side broker workflow. It must not add public OAuth routes, Supabase Custom OIDC configuration, provider calls, or login UI without separate approval.
