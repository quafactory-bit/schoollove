# Changelog

## 2026-08-13 PHASE 10O-R downstream terminal scrub boundary (local / Draft / feature-off)

- Added a forward-only terminal-context check: expired, rejected, and consumed downstream authorization transactions retain neither raw nonce nor raw state.
- Closed provider/identity/callback terminal paths and O-level expiry paths atomically without enabling public OAuth.

## 2026-08-13 PHASE 10O-Q dark broker orchestration (local / blocked / feature-off)

- Began a server-only orchestration seam that shares the existing downstream authorization validator with the dark HTTP issuer and uses only service-RPC persistence ports. Public OIDC routes remain hard-off; no migration or Production action is included.
- Disposable post-correlation provider-failure acceptance found a lifecycle gap: `fail_upstream_login_leg()` correctly left the attempt `failed_safe` and leg `rejected`, while the associated downstream transaction remained `upstream_bound` with raw downstream nonce/state. This finding was closed by the separately approved PHASE 10O-R terminal-scrub boundary; Q acceptance resumes on that R baseline and remains feature-off.

## 2026-08-16 PHASE 10O-Q/S integration (local / Draft / feature-off)

- Integrated the merged S durable-continuation authority into Q's active dark path. Q now resolves and atomically creates/resumes continuation through the S RPCs rather than the destructive O claim/create-leg/bind sequence.
- Fresh crash/restart/race, Google/Naver/Kakao A→E, provider-failure, callback/session, token, and premature-finalization acceptance passed. Q adds no migration, public activation, or live provider call.

## 2026-08-13 PHASE 10O-P transaction-bound broker-code issuance (local / Draft / feature-off)

- Added forward-only `20260813120000_transaction_bound_broker_code_issuance.sql`: every future broker code must link uniquely to its immutable downstream authorization transaction and its exact login attempt; client ID, exact redirect URI, S256 PKCE, nonce proof, state, expiry, and verified-leg authority cannot be caller-substituted.
- Closed service access to the legacy unbound issuance RPC. The new service-only transaction-bound issuance RPC inserts the code then atomically advances attempt → `broker_code_ready`, transaction → `consumed`, and scrubs raw downstream nonce/state; collision rejection leaves an eligible transaction retryable.

- Added the narrow service-only trusted-attempt context resolver and direct PostgreSQL TCP READY/GO acceptance workers. A fresh process can rehydrate only frozen transaction context; nonce-bearing/no-nonce restart and expiry-versus-issuance races are checked without Docker-exec session reuse.

## 2026-08-13 PHASE 10O-O downstream authorization transaction persistence (local / Draft / feature-off)

- Added forward-only `20260813100000_downstream_authorization_transaction_persistence.sql`: one private immutable downstream request ledger with RLS/FORCE RLS, digest-only opaque handle correlation, service-only claim/bind primitives, and attempt/leg substitution rejection.
- Added server-only transaction preparation that normalizes scopes, requires S256-shaped PKCE context, separates the raw continuity handle from the DB payload, and exposes no public route or token/code issuance.

## 2026-08-12 PHASE 10O-N opaque public callback correlation boundary (local / Draft / feature-off)

- Added forward-only `20260812190000_upstream_callback_correlation_boundary.sql`: pending upstream-state digest uniqueness, state-only service claim, canonical attempt→leg lock/re-read, no-mutation unknown-state handling, and exact terminal mismatch/expiry semantics.
- Removed service execution from the old browser-ID-shaped callback claim. Callback parsing rejects browser attempt, leg, transaction, and provider hints; server-only orchestration turns the opaque state proof into database-resolved trusted internal IDs.
- Public callback/OIDC routes remain hard-off and downstream Broker authorization-transaction persistence remains deferred.

## 2026-08-12 PHASE 10O-M Draft security/resume contract fix (local / Draft / feature-off)

- Hardened the unapplied durable-leg migration with an `upstream_pending` identity-clear CHECK, exact live-subject unique-violation discrimination, and coarse known-terminal identity replay handling.
- Added strict durable callback ambiguity and fixed-query redirect binding, plus stateless/resumable pinned OIDC and Naver verification paths. Process-restart acceptance now performs fake token/JWKS/profile verification and derives the broker subject from the verified minimal identity.
- Expanded independent-process callback, wrong/correct-state, identity-finalization, and fail-vs-verify races. Production remains unchanged and hard-off.

## 2026-08-12 PHASE 10O-M durable upstream login-leg boundary (local / Draft / feature-off)

- Added the unapplied forward-only `20260812160000_upstream_login_leg_boundary.sql`: a private RLS/FORCE-RLS attempt-bound upstream redirect ledger, atomic service-only create/claim/fail/leg-bound-identity RPCs, `upstream_pending` attempt state, committed wrong-state failure, replay closure, and terminal crypto scrub.
- Added server-only digest-only state/nonce and separate AES-256-GCM PKCE verifier preparation/resume helpers. Exact framed AAD binds attempt, preallocated leg, provider, client binding, challenge, and key version; raw browser values remain ephemeral.
- Production routes, provider traffic/configuration, credentials, login UI, environment, email, Auth, launch, and migration apply remain unchanged.

## 2026-08-12 PHASE 10O-L dark upstream provider adapter boundary (local / Draft / feature-off)

- Added server-only, transport-injected Kakao and Google OIDC adapters plus a Naver OAuth2-only adapter. Each returns only provider, upstream subject, and optional authentication time; email, profile fields, authorization codes, and tokens are never identity output or persisted.
- Added independent C-leg state, OIDC nonce, and S256 PKCE handling, strict RS256/JWKS validation, exact Google issuer allowlisting, callback/provider substitution rejection, Naver `response.id` parsing, and bounded untrusted transport-response handling.
- Recorded current official Kakao/Google evidence and pinned Naver guide revision in a decision record. The public metadata audit was unauthenticated/read-only; no provider authorization, token, profile, credential, DB, Auth, environment, UI, migration, or Production change is included.

## 2026-08-11 PHASE 10O-J durable broker authorization-code boundary (local / Draft / feature-off)

- Added the forward-only `20260811220000_broker_authorization_code_boundary.sql` migration: a private RLS/FORCE-RLS opaque code ledger plus service-only issue/consume RPCs. It stores a domain-separated 32-byte code digest, exact client/redirect/S256 binding, timestamps, and optional encrypted downstream-nonce tuple—never a raw authorization code, verifier, nonce plaintext, subject, email, token, or profile data.
- Added server-only preparation with a 256-bit base64url code and a separate injected AES-256-GCM downstream-nonce key. The framed AAD binds code UUID, client, redirect URI, and key version; successful Node→DB→Node round-trip and tamper failures are covered in disposable PostgreSQL.
- Added lifecycle, failed-terminal, replay, expiry, issue-state, RPC permission/RLS, and independent-process concurrent consume acceptance. No public OIDC endpoint, `/login` change, provider call/configuration, environment, Production migration/write, or launch change is included.
- Draft security review hardening rejects negative or future `authentication_time` against the authoritative DB issue clock, makes expiry terminalize both code and attempt as `expired`, and makes client/redirect/PKCE failures terminalize code as `rejected` plus attempt as `failed_safe`. Near-expiry issue is now explicitly coarse and cannot expose a `created_at` check violation.

## 2026-08-11 PHASE 10O-I recovery delivery state boundary (local / Draft / feature-off)

- Added a forward-only migration with an RLS/FORCE-RLS private recovery-delivery ledger and service-only atomic reserve, sent, and failure transitions.
- Frozen DB-clock policy: 60-second per-attempt cooldown, three reservation slots per attempt, and five reservations per recovery HMAC/key-version in a rolling 24 hours; failed sends retain their consumed slot.
- Retired ordinary access to standalone login-decision challenge creation. Reservation limits are evaluated before a pending challenge is superseded, and OTP consume now requires the exact ledger record to be `sent`.
- Security hardening rejects NULL crypto/key inputs and NULL OTP MACs before decision, terminalizes superseded unsent reservations, and rejects stale sent confirmations without a resend.
- Added server-only fake in-memory transport orchestration, fresh disposable PostgreSQL lifecycle/permission/concurrency acceptance, and no email provider, network sender, public route, login UI, Auth user, Production migration, or environment change.

## 2026-08-11 — PHASE 10O-H recovery crypto preallocated-ID binding (local / Draft / feature-off)

- Added a forward-only migration that requires a server-preallocated recovery challenge UUID and NEW-account reservation UUID. OTP MAC therefore binds the exact challenge before the database RPC, while AES-256-GCM durable recovery ciphertext binds the exact eventual account ID before account creation.
- Pending `login_decision` challenges own exactly one reservation; every terminal outcome clears the HMAC, ciphertext, nonce, OTP MAC, versions, and reservation. Existing/cross-provider recovery matches consume and discard the reservation without creating an account or attaching the provider.
- Added a server-only preparation helper using `randomUUID` and `crypto.randomInt` for the frozen eight-digit OTP. It returns DB-safe material separately from the ephemeral raw-email/OTP delivery payload and reads no environment secret.
- Added fresh disposable PostgreSQL, actual Node crypto-to-DB round-trip, negative binding, service-only permission, and independent reservation/challenge/recovery-HMAC concurrency acceptance. No public route, login change, real email/provider/Auth user, environment, Production migration, or Production data change is included.

## PHASE 10O-F — Social account and recovery data boundary (Draft; Production feature-off)

- Added an unapplied additive migration for private social-account identity, immutable opaque broker-subject registry, protected recovery verification challenges, and database-only Auth-principal cleanup jobs.
- Added synthetic-key recovery canonicalization/HMAC/AES-256-GCM/OTP-MAC domain tests plus disposable PostgreSQL lifecycle, RLS/grant, and concurrency verification.
- Security hardening removed service-role direct private-table grants, made cleanup evidence survive Auth/account deletion, restored the frozen 8-digit OTP contract, limited current recovery mutation to activation, superseded pending challenges, cleared terminal challenge secrets, and tightened broker-subject, active-row, ciphertext, email, AAD, and HMAC-rotation contracts.
- Final closure binds durable recovery ciphertext to account ID/fixed column/key version, validates email limits by UTF-8 bytes after IDNA, adds fail-fast migration baseline preflight, strengthens terminal-secret and cleanup-job invariants, and extends isolated negative preflight validation.
- No public route, `/login`, existing Supabase email OTP flow, middleware, environment requirement, real email/provider call, Auth user, or Production configuration changed.

## 2026-08-10 — PHASE 10O-E social auth broker core (LOCAL / DRAFT / FEATURE OFF)

- Added a server-only, provider-neutral broker domain core for the frozen Kakao/Naver/Google direction without adding a public route, provider network client, Supabase Auth/DB write, runtime secret, or login UI change.
- Added opaque HMAC-SHA-256 broker subjects, one-time state and nonce digests, S256-only PKCE, an immutable-provider login-attempt state machine, network-free fake upstream adapters, and an ephemeral in-memory RS256 test issuer with opaque Access Token and downstream nonce contracts.
- Added unit and threat-model coverage for state substitution, OAuth mix-up/provider substitution, PKCE downgrade/mismatch, nonce mismatch, callback/code/attempt replay, expiry, client/redirect binding, namespace/key-version separation, terminal reuse, concurrent consume, malformed upstream responses, and sensitive-log leakage.
- Recorded the frozen no-email-linking identity policy and exact recovery-email canonicalization contract, including outer ASCII-whitespace removal before validation, in `docs/decisions/2026-08-10-social-auth-broker-contract.md`.
- Production deploy, DB/migration/environment/Auth/provider configuration, actual provider/API/email/Auth-user activity, launch-state change, Ready transition, and merge remain prohibited.

## 2026-08-04 — PHASE 10N-E browser Supabase lifecycle fix (LOCAL / DRAFT)

- Reproduced `Multiple GoTrueClient instances detected` in a fresh browser tab when school autocomplete first imported `lib/api/search.ts`. The shared module created both `supabase` and `supabaseServer` as browser clients with the same default auth storage key; the warning was not caused by an extension or an old browser session.
- Reused one anon/RLS Supabase client for the full browser-context lifetime, including repeated Fast Refresh evaluations, while preserving stateless server rendering clients and request-scoped authenticated server clients.
- Added lifecycle regression coverage. Targeted validation passed `6 files / 40 tests`, the full suite passed `115 files / 1,012 tests`, TypeScript passed, and the 58-page/route Production build passed. `npm run lint` remains unavailable because the repository has no ESLint configuration and `next lint` enters its interactive setup prompt.
- A fresh post-fix autocomplete context reported zero GoTrueClient warnings, console warnings, and console errors. The existing tab created during the pre-fix-to-fixed HMR transition recorded the expected one-time second client, but a subsequent fixed-module HMR created no third client.
- Automatic Vercel Preview deployment `GRAgyJ8poYn77hQdiWzDFJEDoCch` succeeded for commit `bb41e60a9febf975ca2be9015eb0ec1cbf1e562a`. In the authenticated Preview browser, autocomplete and the Seoul High School Hub rendered correctly with zero Warning/Error/GoTrue warning. Fresh Playwright mobile contexts were redirected to Vercel's protection login instead of the app, so the required direct 360/390/412 app viewport matrix remains blocked; protection settings, cookies, and session stores were not bypassed or changed.
- No Production deployment, migration, database/state/environment mutation, OTP, Auth user, PASS flow, Ready transition, or merge is part of this phase.

## 2026-08-04 — PHASE 10N-D merged Production closed baseline

- Squash-merged PR #39 as `48f693bc0625c4dabfcb9c974c364292877349b6`, deployed that commit to Production, and applied `20260803120000_public_account_soft_launch.sql` once.
- Production remains `closed`: `account_registration=false`, `private_profile=false`, and `school_membership=false`. Production Auth users created by this launch, private profiles, and school memberships remain zero, and ordinary public account registration remains prohibited.
- The PHASE 10N-E Draft does not reopen or mutate this frozen Production baseline.

## 2026-08-04 — PHASE 10N-C2 provider-backed emergency boundary verification (LOCAL / DRAFT)

- Found a real route-level bypass where an active controlled-beta account could submit eligibility during public `emergency_stopped`; introduced one common `public_account_access_active` precheck for eligibility, consent, profile, membership, and onboarding writable state without blocking separate privacy deletion or account-deletion rights.
- Preserved the intended split: `closed` still permits a valid active controlled-beta account, `open` still gives the beta one-school contract precedence, and emergency stops both public and beta account create/update writes.
- Verified targeted `8 files / 54 tests`, full `114 files / 1,008 tests`, TypeScript, the 58-page/route Production build, 18 isolated drift/rollback scenarios, and PHASE 10J/10N lifecycle and permission regressions.
- Completed the modified-head disposable provider matrix: Chromium, mobile 360, mobile 390, and mobile 412 each passed `5/5` (`20/20`, workers `1`, retries `0`). Local GoTrue/PostgREST/PostgreSQL/Mailpit used only `@example.invalid`; provider failure reached `failed_safe`, recovery retry deleted the Auth identity, and the final baseline was `0|0|0|0|10006|0|0|0|0`.
- Canonical-LF migration SHA-256 is `5DF7F3E489D91C18328524C0AA1ACA3F10276F0700604FD27433F68228854A48`. External email, Production Auth, Production migration/state/data, registration open, beta/commercial operation, dependency, lockfile, and environment mutation remain zero.

## 2026-08-03 — PHASE 10N-B public account security hardening (LOCAL / DRAFT)

- Added exact 68→71-table Production preflight/postflight checks, frozen UUID person-link validation, post-reset row-count guards, and full-transaction rollback coverage to the still-unapplied `20260803120000` migration.
- Removed authenticated direct consent, deletion-request, private-profile, and membership writes in favor of fixed-contract `auth.uid()` owner RPCs; added explicit abuse, grant, RLS, function-owner, and empty-search-path checks.
- Split query-free request activity from first-transition milestones, stopped search-page renders and autocomplete from incrementing search activity, and preserved no raw search persistence or per-user telemetry.
- Restored controlled-beta account UI access independently of the closed public launch, kept beta's one-school rule, and strengthened immutable readiness/open/emergency sequencing.
- Selected actual Auth identity deletion: public rows are deleted first, the request moves through `public_data_deleted` and `auth_deletion_pending`, Auth Admin hard-delete is required before `done`, and failures remain blocked and retryable as `failed_safe`; deidentified request/audit evidence is purged after 90 days.
- This entry records the pre-C2 hardening work. Its intermediate validation counts, earlier digest, and provider-blocked conclusion were superseded by the 2026-08-04 C2 verification above.

## 2026-08-03 — PHASE 10N-A public account site completion (LOCAL/DRAFT / PRODUCTION CLOSED)

- Paused first-school controlled-beta selection and completed the separate adult public-account path without selecting a school or creating beta data.
- Added forward migration `20260803120000_public_account_soft_launch.sql`: default-closed five-state launch control, exact three-feature boundary, FORCE RLS, service-only audited state/deletion RPCs, emergency stop, privacy-safe masked funnel, and distinct public-versus-controlled-beta school contracts.
- Tied OTP `shouldCreateUser` to the public-safe launch state, preserved generic enumeration-resistant responses, and added shared server-side expired/near-expiry refresh with two-cookie rotation or clearing.
- Completed KST adult self-attestation, current four-consent idempotency, owner-only private profile, public maximum-three past-school histories, beta single-school regression, restored onboarding, account deletion processing, and administrator launch/deletion controls.
- Reworked Home, `/submit`, login, onboarding, account, Header, and mobile navigation while leaving public people/connection/message/Instagram/promotion/payment functions dormant.
- Added disposable post-reset PostgreSQL lifecycle/RLS/rollback and actual local Supabase Auth/Mailpit/PostgREST Playwright coverage for Desktop 1440 and mobile 360/390/412. Production mutation, registration open, real-person Auth/OTP, beta/commercial data, package/lock, and environment changes remain zero.
- Historical pre-hardening evidence at the PHASE 10N-A head: targeted `10 files / 43 tests`, full `113 files / 996 tests`, TypeScript, 58-page/route Production build, isolated PHASE 10N/10J lifecycle and permission regressions, and provider-backed Playwright `20/20` (`5/5` per viewport, one worker, zero retries). That migration digest was superseded by PHASE 10N-B; the current canonical-LF SHA-256 is recorded above.


## 2026-08-03 — PHASE 10L-F Production legacy person data reset complete

- Squash-merged PR #37 as `3d56ffe33c5f20abf44542c603bf3009708b5339` and deployed that exact commit to Vercel Production before the reset.
- Applied `20260802120000_legacy_person_data_reset.sql` to Production with Supabase CLI `2.111.0`; migration history records the version exactly once.
- Reset `profiles`, `reports`, `traces`, and `search_logs` to 0 while preserving 10,006 schools and unchanged row counts across all 64 preserved public tables.
- Preserved the reviewed RLS/FORCE RLS boundaries and confirmed no PUBLIC/anon/authenticated legacy INSERT table or column grant, INSERT policy, or publicly executable legacy write RPC remains. Raw search persistence stays permanently closed.
- Rechecked after the request-drain interval that no legacy table was repopulated. Official-domain smoke remained healthy, and the reviewed runtime window contained no unintended Warning, Error, Fatal, or 5xx result.
- Created no beta operational or commercial data. The target school remains `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`, and existing registrants will not be contacted, converted, claimed, invited, or reused.
- Final status: `PHASE_10L_F_PRODUCTION_LEGACY_PERSON_DATA_RESET_COMPLETE`.

## 2026-08-02 — PHASE 10L legacy person data reset (LOCAL/DRAFT / PRODUCTION PENDING)

- Decided not to claim, convert, contact, invite, or reuse the 25 pre-account legacy profiles; a returning person will be treated as a completely new private adult account.
- Audited Production read-only without personal output: 25 legacy profiles across 13 schools, 1 linked report, 8 standalone traces across 5 schools, 670 raw search logs, 10,006 schools, and zero new private/account/connection, real beta-operation, promotion, order, or payment rows.
- Added a forward-only, atomic, one-shot reset migration that accepts only the exact audited Production baseline; a raw replay after the zero-person state fails closed.
- Classified the complete Production `public` schema as exactly 68 tables: 4 deletion targets and 64 preserved tables. Any missing, extra, duplicated, or unclassified table and any unexpected UUID person-link column aborts before deletion.
- Permanently retired raw `search_logs` persistence and revoked PUBLIC/anon/authenticated table and column INSERT rights. School search remains available without storing the query; privacy-preserving aggregate telemetry is a separately reviewed follow-up.
- Added isolated Production-shape lifecycle, RLS/grant, PHASE 10J regression, eleven rollback scenarios, and reset-database-backed Chromium/mobile E2E plus a concurrency-safe Production execution runbook.
- Production migration, merge, deployment, data deletion, school selection, beta operation, invitation, communication, advertising, and payment remain unexecuted.

## 2026-08-02 — PHASE 10K limited beta readiness audit (NO PRODUCTION WRITES)

- Audited Vercel Production runtime-log access, incident containment, migration rollback impact, pre-active gates, school selection, invite/member operations, and privacy/minor safety without starting a beta.
- Confirmed the existing authenticated Vercel dashboard session can read `schoollove-kr` Production logs without a new token; the visible last-30-minute window showed 0 warnings, 0 errors, and 0 fatal entries. Hobby retention remains limited, so incident evidence must be captured promptly without personal content.
- Defined containment-first rollback and a forward-corrective migration preference for `20260730100000`; destructive schema rollback is not an ordinary operating action.
- Kept the target school at `TARGET_SCHOOL_PENDING_OPERATOR_DECISION` and created no Draft, snapshot, allowlist, program, feature flag, readiness, invite, member, OTP, message, Instagram permission, promotion, order, or payment.
- Final audit status: `PHASE_10K_LIMITED_BETA_READINESS_AUDITED_NO_PRODUCTION_WRITES`.

## 2026-07-30 — PHASE 10J first controlled beta safety boundaries (PRODUCTION / MERGED / NO BETA DATA)

- Added a validated school UUID to the setup Draft and immutable snapshot, plus an RLS/FORCE RLS `beta_program_schools` table that permits exactly one school per snapshot-backed program.
- Added idempotent service-role-only feature configuration, atomic `paused` to `active` start, and separate post-emergency reactivation RPCs. Start and reactivation recheck the 20-member, 14-day, one-school, mandatory-stop, readiness, and exact two-feature contract.
- Restricted invite issuance to an active in-window contract, one use, at most seven days, and available capacity. Redemption and administrator approval copy and recheck the immutable school boundary.
- Enforced the selected school and single-school history at the private membership DB boundary; public registration and legacy program behavior are not widened.
- Updated administrator surfaces to select a school UUID, show contract blockers, configure only program-scoped flags, list only invite-eligible programs, and remove generic emergency restore.
- Verified 24 targeted tests, 109 files / 1012 full tests, TypeScript, 59-page Production build, isolated PostgreSQL lifecycle/RLS/grants, and 11 Chromium/mobile E2E tests; 9 redundant mobile API-only project cases were intentionally skipped while the complete UI workflow ran at every viewport.
- Applied migration `20260730100000_first_controlled_beta_safety_boundaries.sql` to Production, squash-merged PR #35, and deployed merge commit `d8ab78a308dae7e796eb16601303e4b392fcee93` to Vercel Production.
- Verified migration history, the new/changed PHASE 10J objects, RLS/FORCE RLS, role boundaries, and the existing public Production read flows without creating test data.
- Created no real Draft, snapshot, allowlist, program, feature flag, readiness, invite, member, OTP, message, Instagram permission, promotion, order, or payment. The target school remains `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`.
- Final status: `PHASE_10J_PRODUCTION_APPLIED_AND_MERGED_NO_BETA_DATA`.

## 2026-07-30 — PHASE 10J-A first controlled beta preflight

- Completed a read-only Production and implementation audit for the first real controlled beta; no beta program, invite, member, feature flag, OTP, message, Instagram permission, promotion, order, or payment was created or changed.
- Recommended a new 20-member, 14-day, one-school, adult-graduate program with one-use seven-day invites, administrator approval, and only `account_registration` plus `private_profile` initially allowed. The school remains `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`.
- Classified the legacy active `limited_beta_2026` readiness seed as `NEW_PROGRAM_RECOMMENDED` because it has no immutable setup snapshot, no end time, and inherits all eight enabled global feature flags.
- Found blocking gaps in the atomic `paused` to `active` transition and enforceable school-ID scope. PHASE 10J-B implementation is required before any real program creation, activation, or invite.
- Recorded the complete audit and proposed remediation in `docs/decisions/2026-07-30-first-controlled-beta-plan.md`.

## 2026-07-29 — PHASE 10I controlled beta operations

- Preserved every validated setup as an immutable program snapshot and enforced capacity, invite, feature, and mandatory-stop contracts at database boundaries.
- Made pre-activation draft-key changes persistent with explicit draft/program collision errors and idempotent activation retries.
- Added operator-only setup, member, school, advertiser, feedback, task, daily-report, emergency-stop, and readiness surfaces.
- Added eight RLS/FORCE RLS operation tables and atomic service-role audit RPCs.
- Added active beta-member feedback with personal/external identifier filtering.
- Added Preview/isolated-only synthetic lifecycle mode; Production remains fail-closed.
- Applied Production migration `20260729190000`, squash-merged PR #32 as `8352036ce58e510364fb3a830124b2d41ce58e4e`, and completed Vercel Production deployment and verification.
- Verified RLS/FORCE RLS on all 8 tables while preserving 25 public profiles, 10,006 schools, and all existing connection, message, Instagram-permission, promotion, order, and payment data.
- Created no operational rows, program, invite, member, or feature flag during verification. Public launch, program activation, invite delivery, real OTP/messages/notifications, advertising execution, and live payment remain separately approved operations.

## 2026-07-29 — PHASE 10H (LOCAL/DRAFT)

- 최종 감사에서 10명 미만 funnel 마스킹, 사람 찾기 중단의 안부 연쇄 차단, 메시지 중단의 기존 대화 차단, 안전 조치 예외, 중복 초대 사용 횟수 보호, membership 프로그램 우선 선택을 보강했다.
- 성인 확인·필수 동의·해시 초대·운영자 승인·비공개 프로필·과거 학교 이력을 연결하는 `/onboarding` 제한 출시 흐름을 추가했다.
- 본인만 읽는 온보딩 진행 상태, 단계별 최초 진입 이벤트, 개인 원문 없는 일별 성장 집계를 추가했다.
- direct·organic social·creator·community·referral·paid social·unknown의 거친 출처만 허용하고 raw UTM·IP·referrer·검색어·이름·Instagram을 저장하지 않는다.
- 관리자 운영 화면에 현재 단계와 최근 14일 집계만 추가하고 기존 관리자 인증 경계를 유지했다.
- PHASE 10H migration은 Production에 적용하지 않고 Draft PR까지만 진행한다.

## 2026-07-29 — PHASE 10G (PRODUCTION)

- PR #30을 squash merge하고 merge commit `e76a3f67bce067bf55329ffbbeb14cf37b8816f4`를 Vercel Production에 배포했다.
- PHASE 10E schema 원문과 Production의 272개 정규화 객체 정의가 일치함을 확인한 뒤 누락된 migration history만 공식 repair로 복구했다.
- PHASE 10G migration을 Production에 적용하고 신규 결제 테이블 4개, 함수 9개, RLS/FORCE RLS와 service-role 권한을 검증했다.
- 기존 공개 프로필 25건과 private/connection/promotion/order 집계는 변경되지 않았고 신규 결제 테이블은 0건이다.
- PortOne webhook은 `PAYMENT_PROVIDER_NOT_CONFIGURED` 503이며 live payment·Production secret·실제 결제·환불·광고 주문은 활성화하지 않았다.

## 2026-07-29 — PHASE 10G (LOCAL/DRAFT)

- provider-neutral `PaymentProvider`를 create/get/verify/cancel/refund/webhook/receipt contract로 확장했다.
- manual fallback, local mock, PortOne V2 sandbox adapter를 추가했다.
- 결제·webhook replay·부분 환불·증빙 요청 schema와 service-only 원자 RPC를 추가했다.
- owner 결제 API/화면과 admin 결제·webhook·환불 운영 화면을 추가했다.
- Production credential, Production webhook, 실제 결제, migration 적용은 수행하지 않았다.
## 2026-08-10 — PHASE 10O-G (LOCAL / DRAFT / FEATURE OFF)

- Added the forward-only attempt-first social login decision boundary, including durable safe-id-only attempts, attempt-bound recovery challenges, recovery-first account decision, and hardened Auth-principal bind ordering.
- Recovery-email matches return the retained primary provider and never attach another provider or create a second identity/account.
- No public OAuth/OIDC/recovery route, login UI, provider call, real email/OTP, Auth user, Production migration, launch, or environment change is included.
## 2026-08-14 — PHASE 10O-S (LOCAL / DRAFT / FEATURE OFF)

- Added a forward-only durable continuation recovery boundary after the Q claim/bind crash audit: an additive browser-bound continuation digest, atomic create-or-resume upstream leg binding, encrypted state/optional-nonce recovery material, and a service-only abandoned-context expiry path.
- The original O handle-only claim contract remains compatible. No public social/OIDC route, provider call, login UI, Production migration, database mutation, environment change, or launch change is included.
- Route-surface acceptance uses reproducible exact frozen-baseline parity: baseline `99efcd22c3d048a2eb545f3811069fba62291821` and S each expose 95 canonical public routes, with zero additions or removals. The historical absolute `58 pages/routes` record is retained, but is not reproducible on that frozen baseline and is not an executable S assertion.
- Hardened the durable continuation selector with a partial unique live-authority index and coarse collision handling; the existing authority remains resumable under duplicate creation attempts. No public activation or Production change is included.
