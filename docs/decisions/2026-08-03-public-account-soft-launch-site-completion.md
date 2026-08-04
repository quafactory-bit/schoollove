# PHASE 10N-B — Public account soft launch security hardening

Status: `PRODUCTION_APPLIED_CLOSED_ACCOUNT_LAUNCH_PROHIBITED`

## Decision

The first controlled-beta school-selection plan is paused. Before selecting a school or issuing an invite, SchoolLoveI will complete the ordinary adult account path: visit, email OTP login, adult self-attestation, four required consents, one owner-only private profile, up to three owner-only past-school memberships, onboarding restoration, account management, logout, and deletion request.

This is not approval to open Production. PR #39 was squash-merged as `48f693bc0625c4dabfcb9c974c364292877349b6`, that application was deployed, and migration `20260803120000_public_account_soft_launch.sql` was applied once. The singleton remains `closed`; `account_registration`, `private_profile`, and `school_membership` are false, and launch-created Auth users, private profiles, and school memberships remain zero. Any state change, environment change, registration, Auth user/OTP/email, school selection, beta data, promotion, payment, connection, or message operation requires separate approval.

## Separate authorization contracts

Public accounts use `public_account_launch_control`; controlled beta continues to use its immutable snapshot, one-school allowlist, active member, time window, flags, readiness, and emergency contracts. The public boundary has exactly three possible features: `account_registration`, `private_profile`, and `school_membership`. It does not contain people search, connection, messaging, Instagram permission, promotion, operations, or payment keys.

States are `closed`, `internal_test`, `ready`, `open`, and `emergency_stopped`:

- `closed`, `ready`, and `emergency_stopped` permit no public account write.
- `internal_test` permits profile and school-membership writes for an existing authenticated synthetic/local user but does not permit Auth user creation.
- `open` permits all three public features only after a separate `ready` decision.
- an emergency stop blocks all three features. It can return only to `closed`; a new immutable readiness record and separate open approval are then required.
- the same emergency stop overrides active controlled-beta access for eligibility, consent, profile, membership, and onboarding writable state. `closed` still permits a valid active-beta account, and `open` still keeps the beta one-school contract. Owner privacy deletion and account-deletion rights remain separate from create/update shutdown.

Only service-role RPCs mutate launch state. Generic state mutation cannot select `ready` or `open`. Readiness records the reviewed commit, migration version and hash, health, RLS/grants, Auth/SMTP, deletion operator, runtime logs, Preview/isolated checks, blocker list, and affirmative operator decision in append-only audit metadata. Only the latest, blocker-free record from the last 24 hours can authorize the separate open RPC; any later state or emergency audit invalidates it. The singleton, audit, and aggregate tables use RLS and FORCE RLS and expose no direct PUBLIC/anon/authenticated mutation.

Before permanent DDL, the migration verifies the exact post-reset Production contract: 68 public tables, the frozen UUID person-link catalog, legacy `0/0/0/0`, schools 10,006 with no growth drift, no private/account/connection/safety person rows, no editorial links, no actual beta operations or scoped flags, one legacy beta program, eight global flags, and no commercial rows. The complete preflight, 68→71 DDL, postflight, and permission audit run in one explicit transaction.

## Pre-implementation audit findings

The existing site had no authorization boundary separate from controlled beta, OTP requests always used `shouldCreateUser: true`, and expired access cookies had no shared refresh-and-rotation path. Login was only a partial flow. Public onboarding still depended on invite/operator/beta semantics, profile and school writes inherited beta membership requirements, and account deletion had no atomic administrator completion or durable session block. Home, submit, account, and navigation copy still exposed the former maintenance/beta direction, dormant connection surfaces remained reachable, and public-account funnel measurement had no separate privacy contract.

The hardening audit additionally found that old authenticated table grants could bypass route validation, repeated writes inflated conversion counts, search page renders were counted as searches, controlled-beta users could be blocked by public-only UI flags, deletion copy promised more than the Auth process performed, and generic administrator transitions made readiness too weak. The migration and application now close those boundaries.

## Authentication and session

`request-otp` reads only the public-safe launch RPC. When registration is closed, Supabase receives `shouldCreateUser: false`; existing users can request login, nonexistent users receive the same generic response, and provider failures do not reveal account existence. When registration is open, `shouldCreateUser: true` is permitted, with the same generic response. IP and normalized email are represented only by existing rate-limit hashes; raw values are not persisted or logged.

Access and refresh tokens stay in HttpOnly, SameSite=Lax, `/` cookies with Production Secure and explicit max-age. Shared middleware refreshes only a missing, invalidly shaped, expired, or 60-second-near-expiry access token. Successful refresh rotates both cookies; failure clears both. Refresh tokens never enter browser JavaScript or response bodies. The 30-day refresh cookie is a client retention ceiling, not a promise of a 30-day provider session.

## Adult and consent

Adult eligibility is KST calendar age 19 or older, self-attested. The input must be a real `YYYY-MM-DD` calendar date, cannot be future or older than the supported range, and is used only in request memory. Only `adult_eligible=true`, `self_attestation`, current policy version, and timestamps persist. Repeated submission is idempotent per user and policy version.

The current required consents remain `terms`, `privacy_collection`, `adult_confirmation`, and `private_by_default`. Only consent type, current policy version, boolean, and timestamps persist. A future version requires a new record. All four current consents are required before profile or school writes.

## Private profile and school history

The verified session, never a body user ID, supplies ownership. RLS keeps owner-only SELECT, while authenticated direct INSERT/UPDATE/DELETE is revoked. Owner-only SECURITY DEFINER RPCs derive `auth.uid()`, repeat access/adult/deletion checks, normalize and validate text, force `profile_photo_url=NULL`, `profile_visibility='private'`, and `status='active'`, and return only safe fields. Consent and deletion direct INSERT policies/grants are also removed; their RPCs accept no owner or free-form deletion reason.

General public accounts may store at most three memberships with an existing school UUID and a non-future graduation year. The owner RPC resolves the profile in the database, takes an advisory transaction lock, and rejects duplicates safely. An active controlled-beta member remains on the existing single approved-school contract and does not inherit the public three-school rule. The account UI uses feature-specific `public OR controlled-beta` access and shows the one-school limit when beta scope takes precedence.

## Onboarding and public surfaces

Public onboarding is derived from actual account rows: login, adult, consents, profile, school, ready. Invite redemption, operator approval, beta member state, and people-search readiness are absent. A sync or aggregate failure cannot convert a successful account write into failure.

Home and `/submit` describe closed/internal/ready/open/emergency states without counts or administrator details. Account, login, and onboarding remain noindex. School search and School Hub remain public. Public people lists, person URLs, partial/exact person discovery, Instagram exposure, connections, notifications, promotion, and payment are not activated.

## Deletion

A verified user may submit one idempotent no-argument request. No free-form reason is accepted or stored, and every active deletion state blocks further account writes and sessions.

Deletion is an explicit two-system process. Phase one transactionally deletes public profile, membership, onboarding, adult, and consent rows; blocks the Auth identity; marks `public_data_deleted`; and emits a non-personal audit event. The service-only handoff then marks `auth_deletion_pending` and returns the linked identity to the application, which calls the Auth Admin hard-delete API. Provider failure is recorded as `failed_safe`, never `done`, and is retryable while access remains blocked. Auth deletion clears the request's user foreign key; only then can finalization mark `done`. The now-deidentified request and its minimal operational audit are retained for 90 days for retry and incident reconciliation, then the service-only purge RPC removes them. No unverified legal-retention claim is made.

## Privacy-safe measurement and administration

Activity request counters are `public_home_view`, `login_page_view`, `school_search_started`, and provider-accepted `otp_request_accepted`. They are request counts, not unique visitors. Search increments only when a two-or-more-character results RPC actually runs; page render and autocomplete do not increment it.

Milestones are `otp_verify_succeeded`, `adult_eligibility_completed`, `required_consents_completed`, `private_profile_created`, `first_school_membership_created`, `onboarding_completed`, and `account_deletion_requested`. Each increments only on the first persisted transition. Profile edits, second or third schools, repeated consent/adult/deletion submissions, and reloads do not increment it. `return_session` is removed because no privacy-safe deduplication contract exists. Aggregates store only event kind, event, coarse source, date, and count; they never store search text or a public per-user telemetry row. Administrator output distinguishes activity from milestone and masks counts below 10.

## Verification and residual risk

The disposable PostgreSQL suite must apply the post-reset baseline before this migration and verify lifecycle, RLS/FORCE RLS, grants, function ownership/search paths, emergency recovery, deletion rollback, exact public-school limit, controlled-beta regression, and unchanged legacy/school/beta/commercial baselines. Browser coverage must include Desktop 1440 and mobile 360/390/412.

Provider-backed verification exposed and corrected one real application boundary defect: active controlled-beta eligibility could bypass public emergency at the route layer even though the UI was disabled. All account create/update routes and onboarding now require the shared access-active check before public-or-beta feature evaluation; deletion rights remain separately available.

For the hardened modified head, targeted Vitest passed `8 files / 54 tests`; the full suite passed `114 files / 1,008 tests`; TypeScript, the 58-page/route Production build, 18 isolated drift/rollback scenarios, and PHASE 10J/10N lifecycle/permission suites passed. The isolated final data baseline remained legacy `0/0/0/0`, schools `10006`, beta/commercial `0`, and launch `closed`.

The disposable provider-backed browser matrix passed `20/20` with Chromium, mobile 360, mobile 390, and mobile 412 each `5/5`, workers 1, and retries 0. It used only loopback/Docker-local PostgreSQL, PostgREST, GoTrue, Mailpit, synthetic UUIDs, and `@example.invalid`. Forced Auth provider deletion failure produced `failed_safe`; recovery and retry deleted the identity and completed the request. The final provider baseline was `0|0|0|0|10006|0|0|0|0`; external email and Production Auth were zero.

The canonical-LF migration SHA-256 is `5DF7F3E489D91C18328524C0AA1ACA3F10276F0700604FD27433F68228854A48`. Production remains closed regardless of local or Preview evidence.

PHASE 10N-E reproduced the historical GoTrue warning at the actual school-autocomplete activation boundary. `lib/supabase.ts` exported two separately created anon clients into the browser bundle, so both auth clients used the same storage key. The fix reuses one anon/RLS client for the browser-context lifetime and aliases browser `supabaseServer` consumers to it, while leaving stateless server rendering and request-scoped authenticated server clients separate. Fresh post-fix autocomplete produced zero warnings/errors, and a repeated fixed-module HMR created no additional auth client. This lifecycle fix and its Draft Preview do not authorize a Production deployment or any launch-state operation.

Residual risks are external email deliverability, Production provider configuration, Production traffic/log evidence, operator readiness, and the irreversible human decision to open registration. These remain later approval gates.
