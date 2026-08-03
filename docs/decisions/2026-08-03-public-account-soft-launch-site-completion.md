# PHASE 10N-A — Public account soft launch and site completion

Status: `LOCAL_VERIFIED_PRODUCTION_CLOSED`

## Decision

The first controlled-beta school-selection plan is paused. Before selecting a school or issuing an invite, SchoolLoveI will complete the ordinary adult account path: visit, email OTP login, adult self-attestation, four required consents, one owner-only private profile, up to three owner-only past-school memberships, onboarding restoration, account management, logout, and deletion request.

This is not approval to open Production. Migration `20260803120000_public_account_soft_launch.sql` starts `closed`, and deploying code or applying the migration cannot change it to `open`. Production migration, state change, environment change, registration, Auth user/OTP/email, school selection, beta data, promotion, payment, connection, and message operations require separate approvals.

## Separate authorization contracts

Public accounts use `public_account_launch_control`; controlled beta continues to use its immutable snapshot, one-school allowlist, active member, time window, flags, readiness, and emergency contracts. The public boundary has exactly three possible features: `account_registration`, `private_profile`, and `school_membership`. It does not contain people search, connection, messaging, Instagram permission, promotion, operations, or payment keys.

States are `closed`, `internal_test`, `ready`, `open`, and `emergency_stopped`:

- `closed`, `ready`, and `emergency_stopped` permit no public account write.
- `internal_test` permits profile and school-membership writes for an existing authenticated synthetic/local user but does not permit Auth user creation.
- `open` permits all three public features only after a separate `ready` decision.
- an emergency stop blocks all three features. It can return only to `closed` with `POST_EMERGENCY_READINESS_REVIEWED`, after which ordinary readiness is repeated.

Only service-role RPCs mutate launch state. The singleton, audit, and aggregate tables use RLS and FORCE RLS and expose no direct PUBLIC/anon/authenticated mutation.

## Pre-implementation audit findings

The existing site had no authorization boundary separate from controlled beta, OTP requests always used `shouldCreateUser: true`, and expired access cookies had no shared refresh-and-rotation path. Login was only a partial flow. Public onboarding still depended on invite/operator/beta semantics, profile and school writes inherited beta membership requirements, and account deletion had no atomic administrator completion or durable session block. Home, submit, account, and navigation copy still exposed the former maintenance/beta direction, dormant connection surfaces remained reachable, and public-account funnel measurement had no separate privacy contract.

During end-to-end verification, five additional defects were found and corrected: exact `/api/onboarding` was missing from middleware session matching; the disposable GoTrue user lacked the authenticated role expected by PostgREST; the Mailpit harness could select a stale OTP and hit the default SMTP interval; a pending deletion trigger could block insertion of its own deletion request; and GoTrue could not parse PostgreSQL `infinity` as `banned_until`, so the tombstone now uses the finite provider-compatible `9999-12-31 23:59:59+00` value. All corrections remained local and are covered by the final verification.

## Authentication and session

`request-otp` reads only the public-safe launch RPC. When registration is closed, Supabase receives `shouldCreateUser: false`; existing users can request login, nonexistent users receive the same generic response, and provider failures do not reveal account existence. When registration is open, `shouldCreateUser: true` is permitted, with the same generic response. IP and normalized email are represented only by existing rate-limit hashes; raw values are not persisted or logged.

Access and refresh tokens stay in HttpOnly, SameSite=Lax, `/` cookies with Production Secure and explicit max-age. Shared middleware refreshes only a missing, invalidly shaped, expired, or 60-second-near-expiry access token. Successful refresh rotates both cookies; failure clears both. Refresh tokens never enter browser JavaScript or response bodies. The 30-day refresh cookie is a client retention ceiling, not a promise of a 30-day provider session.

## Adult and consent

Adult eligibility is KST calendar age 19 or older, self-attested. The input must be a real `YYYY-MM-DD` calendar date, cannot be future or older than the supported range, and is used only in request memory. Only `adult_eligible=true`, `self_attestation`, current policy version, and timestamps persist. Repeated submission is idempotent per user and policy version.

The current required consents remain `terms`, `privacy_collection`, `adult_confirmation`, and `private_by_default`. Only consent type, current policy version, boolean, and timestamps persist. A future version requires a new record. All four current consents are required before profile or school writes.

## Private profile and school history

The verified session, never a body user ID, supplies ownership. RLS permits owner-only SELECT/INSERT/UPDATE/DELETE, forces `profile_visibility='private'`, and blocks writes after a pending or completed deletion request. The API accepts a normalized display name and optional private Instagram handle and introduction; it rejects control/format characters and limits lengths. Profile photo input is omitted until a reviewed upload path exists.

General public accounts may store at most three memberships with an existing school UUID and a non-future graduation year. Exact user/profile/school/year duplicates are rejected safely. An active controlled-beta member remains on the existing single approved-school contract and does not inherit the public three-school rule.

## Onboarding and public surfaces

Public onboarding is derived from actual account rows: login, adult, consents, profile, school, ready. Invite redemption, operator approval, beta member state, and people-search readiness are absent. A sync or aggregate failure cannot convert a successful account write into failure.

Home and `/submit` describe closed/internal/ready/open/emergency states without counts or administrator details. Account, login, and onboarding remain noindex. School search and School Hub remain public. Public people lists, person URLs, partial/exact person discovery, Instagram exposure, connections, notifications, promotion, and payment are not activated.

## Deletion

A verified user may submit one idempotent request. No free-form reason is stored. Pending or completed requests block profile and school writes. The service-only administrator RPC atomically deletes the private profile (and cascading memberships), clears private onboarding state, marks the request done, and writes a reason-code-only audit event. A forced intermediate failure rolls back all effects.

The Auth identity is deliberately retained as a long-term blocked tombstone to prevent silent re-registration. The same database transaction sets `auth.users.banned_until` to the finite provider-compatible UTC timestamp `9999-12-31 23:59:59`, removes the private profile and cascading memberships, completes the request, and writes the safe audit record. The application authentication boundary also rejects every completed deletion, so an already-issued session cannot regain account access. Adult eligibility, consent, deletion request, and audit evidence are retained for legal accountability; no personal raw content is copied into audit. The user UI states this policy and routes errors to operator contact. Cancellation is not offered after submission.

## Privacy-safe measurement and administration

Allowed daily KST counters are: `public_home_view`, `school_search_started`, `login_page_view`, `otp_request_accepted`, `otp_verify_succeeded`, `adult_eligibility_completed`, `required_consents_completed`, `private_profile_saved`, `school_membership_saved`, `onboarding_completed`, `return_session`, and `account_deletion_requested`.

They store only event, coarse source (`direct`, `school_search`, `account`, `onboarding`), date, and atomic count. They never store email, user/profile/school identifiers, names, Instagram, date of birth, search text, IP, user agent, invite/session/token/cookie, arbitrary attribution, or per-user rows. Administrator output masks counts below 10 and shows deletion request IDs/statuses but no email, user ID, or reason content.

## Verification and residual risk

The disposable PostgreSQL suite must apply the post-reset baseline before this migration and verify lifecycle, RLS/FORCE RLS, grants, function ownership/search paths, emergency recovery, deletion rollback, exact public-school limit, controlled-beta regression, and unchanged legacy/school/beta/commercial baselines. Browser coverage must include Desktop 1440 and mobile 360/390/412.

Actual local authentication was completed with disposable PostgreSQL, PostgREST, GoTrue, and Mailpit. The full browser suite passed `20/20`: Chromium `5/5`, mobile 360 `5/5`, mobile 390 `5/5`, and mobile 412 `5/5`, with one worker and zero retries. This was provider-backed OTP/session/refresh testing, not a route mock. Targeted Vitest passed `10 files / 43 tests`; the full suite passed `113 files / 996 tests`; TypeScript, the 58-page/route Production build, `git diff --check`, secret scan, and the isolated lifecycle/RLS/rollback suite passed. The isolated and browser final data baselines remained legacy `0/0/0/0`, schools `10006`, and beta/commercial `0`.

The migration SHA-256 is `F9E8872642DAE68A283C7ABB3E9DBD74ADEDE096EB0369EAB9BE31F1FC552F15`. Production remains closed and unchanged regardless of local evidence.

Residual risks are external email deliverability, Production provider configuration, Production traffic/log evidence, operator readiness, and the irreversible human decision to open registration. These remain later approval gates.
