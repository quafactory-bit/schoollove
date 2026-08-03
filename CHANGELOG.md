# Changelog

## 2026-08-03 — PHASE 10N-A public account site completion (LOCAL/DRAFT / PRODUCTION CLOSED)

- Paused first-school controlled-beta selection and completed the separate adult public-account path without selecting a school or creating beta data.
- Added forward migration `20260803120000_public_account_soft_launch.sql`: default-closed five-state launch control, exact three-feature boundary, FORCE RLS, service-only audited state/deletion RPCs, emergency stop, privacy-safe masked funnel, and distinct public-versus-controlled-beta school contracts.
- Tied OTP `shouldCreateUser` to the public-safe launch state, preserved generic enumeration-resistant responses, and added shared server-side expired/near-expiry refresh with two-cookie rotation or clearing.
- Completed KST adult self-attestation, current four-consent idempotency, owner-only private profile, public maximum-three past-school histories, beta single-school regression, restored onboarding, account deletion processing, and administrator launch/deletion controls.
- Reworked Home, `/submit`, login, onboarding, account, Header, and mobile navigation while leaving public people/connection/message/Instagram/promotion/payment functions dormant.
- Added disposable post-reset PostgreSQL lifecycle/RLS/rollback and actual local Supabase Auth/Mailpit/PostgREST Playwright coverage for Desktop 1440 and mobile 360/390/412. Production mutation, registration open, real-person Auth/OTP, beta/commercial data, package/lock, and environment changes remain zero.
- Final evidence: targeted `10 files / 43 tests`, full `113 files / 996 tests`, TypeScript, 58-page/route Production build, isolated PHASE 10N/10J lifecycle and permission regressions, and provider-backed Playwright `20/20` (`5/5` per viewport, one worker, zero retries). Migration SHA-256: `F9E8872642DAE68A283C7ABB3E9DBD74ADEDE096EB0369EAB9BE31F1FC552F15`.


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
