# PHASE 10O-F — social account identity registry and recovery-data boundary

## Decision

PHASE 10O-F adds an additive, dark database boundary in the non-public `private` schema. It does not replace the established `auth.users.id` owner key used by adult eligibility, consents, private profiles, memberships, or deletion requests. No existing row is backfilled, claimed, linked, or reclassified.

`private.private_accounts` stores an immutable primary provider and opaque broker subject. `private.social_identity_registry` accepts exactly `slb:v1:kNN:<kakao|naver|google>:<43-char-base64url-digest>` and checks provider/key-version agreement again in the database; it never stores an upstream raw subject, email, or profile attribute. A partial unique index permits exactly one active primary identity and verified recovery HMAC per retained account, including deletion-pending and cleanup-failed-safe states. Automatic cross-provider or email-based linking is absent.

Recovery canonicalization removes only outer ASCII whitespace, preserves the subsequent local part exactly (including case, Unicode, plus tags, and dots), and converts only the domain through IDNA ASCII then lowercase. The supported local grammar is explicit unquoted atom-style text; quoted strings, domain literals, controls, whitespace, `<>()[],:;`, quote, and backslash are rejected without rewriting accepted text. The server-only domain layer uses distinct versioned synthetic keys for SHA-256 recovery-email HMAC, AES-256-GCM (96-bit nonce, 128-bit tag, length-framed domain/purpose/UUID-record AAD), and framed 8-digit numeric OTP HMAC-SHA-256. The database stores HMAC/ciphertext/nonce/OTP MAC only; raw email and raw OTP have no column.

`private.recovery_email_verifications` has a maximum ten-minute lifetime, five failed attempts, and terminal consumed/locked/expired/revoked states. Only `activation` is implemented by the current mutation RPC; `change`, `cross_provider_check`, and `recovery_assistance` require separate future state machines and cannot mutate account recovery material here. A new activation challenge revokes and clears the prior pending activation challenge under an account lock. Every terminal challenge clears its HMAC, destination ciphertext/nonce, key versions, and OTP MAC. A successful consume is single-use and applies protected recovery material atomically. Activation requires complete verified recovery material, a bound Auth principal, and the existing public-account launch state to be `open` with all three existing account features enabled. Production remains `closed`, and this PR adds no activation route.

Deletion revokes the registry, clears recoverable ciphertext/nonce immediately, retains the verified HMAC until Auth cleanup, and enqueues an idempotent database-only cleanup job. The cleanup job stores the Auth UUID as durable opaque evidence without an `auth.users` foreign key; Auth deletion therefore sets account/registry principal links to NULL while retaining the job. Later private-account deletion cascades registry/challenges and sets the job account reference to NULL. This PR never deletes an Auth user or sends an email.

All private tables use RLS + FORCE RLS, have no PUBLIC/anon/authenticated/service-role table grants, and are outside the PostgREST public schema. Mutation RPCs are `SECURITY DEFINER`, use an empty `search_path`, revoke PUBLIC access, and grant execute only to `service_role`; service role has no `private` schema usage or direct table path. The sole authenticated RPC is a minimal owner-status projection excluding crypto, HMAC, digest, broker subject, and cleanup details.

## HMAC key rotation limitation and operating rule

The verified-recovery uniqueness index is `(recovery_email_hmac, recovery_email_hmac_key_version)`. Different HMAC key versions cannot prove equality solely from stored HMAC values. Normal writes therefore use one approved current HMAC key version only. During a rotation, registration and recovery-email changes remain maintenance-closed; retained rows are recomputed with the new key, duplicates are checked, the current version is atomically switched, and writes resume only after completion. Simultaneous general registration under different HMAC key versions is prohibited. This PR does not introduce KMS/HSM custody or execute rotation.

## Verification and scope

The disposable local Supabase PostgreSQL suite exercises lifecycle, permission, and concurrent broker-subject/pending-challenge/recovery-HMAC/challenge-consume races. It uses only `example.invalid` synthetic data and removes the container afterwards. This migration is not applied to Production; no Production DB, environment, Supabase Auth setting, provider, KMS/HSM key, real email/OTP, or login UI changes.

The next phase may connect this dark registry to a reviewed server-side broker workflow. It must not add public OAuth routes, Supabase Custom OIDC configuration, provider calls, or login UI without separate approval.
