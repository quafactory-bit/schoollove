# SchoolLoveI Implementation Log

## 2026-08-22 PHASE 10P social activation and bound-provisional reauthentication (Draft)

- Added `20260822022953_social_activation_gate_and_bound_provisional_reauth.sql`. A missing launch singleton is repaired to closed with one non-personal audit row; a valid singleton is validated and preserved byte-for-byte; ambiguous or malformed state fails before function replacement.
- Activation authority is now the consumed login attempt rather than a browser-supplied account ID. Exact account, primary identity, recovery custody, `auth.users`, and Custom OIDC `auth.identities` mappings are required before the launch-gated atomic transition.
- Exact bound provisional same-provider login returns `BOUND_PROVISIONAL_REAUTH_READY`, advances the fresh attempt through the existing `auth_principal_bound` issuance path, and skips recovery delivery. Disposable acceptance covers the complete fail-closed matrix, closed/open behavior, launch and activation/reauth races, service-only permissions, and the prior J/M/N/O/P/R/S plus stale-expiry/idempotency/resume chains.
- No remote database, Google/Kakao/Naver, Resend, Vercel, Auth/provider configuration, login UI, launch, or Production mutation was performed.

## 2026-08-20 PHASE 10P stale social-attempt expiry (Draft)

- Added forward-only migration `20260820091834_expire_stale_social_identity_attempts.sql`. An expired identity-live attempt is moved to `expired` under deterministic transaction/attempt/recovery/broker locking before a new exact broker subject can enter the unchanged partial unique index.
- The private helper expires pending recovery verification through the existing terminal-material trigger, fails only unsent `reserved` delivery work, retains `sent`/`failed` ledger history, expires and scrubs live downstream authorization context, and leaves terminal upstream legs and already-terminal history unchanged.
- Fresh disposable DB acceptance covers one-time existing-row cleanup, the observed stale `recovery_pending` case, live-owner fail-closed behavior, recovery-required/recovery-verified expiry, terminal immutability, permissions, uniqueness, normal first login, and two-process same-subject concurrency. No remote database, provider, Resend, Vercel, Auth, UI, or Production action was performed.

## 2026-08-19 PHASE 10P first social login recovery/finalization (Draft)

- Replaced the deployed callback's terminal 204 gap with explicit `EXISTING_PRIMARY` finalization and `RECOVERY_REQUIRED` continuity. Recovery uses encrypted HttpOnly authority, existing recovery cryptography/RPC budgets, and a server-only idempotent Resend boundary.
- Added a hidden Preview-only recovery form and Supabase completion route. The completion route validates the Supabase user and exact OIDC subject before a service-only attempt-derived principal bind; browser account/attempt input is not accepted.
- Added one forward-only migration and no private table. No remote database, provider, email, environment, Auth configuration, login UI, Production, or launch mutation was performed.

## 2026-08-13 PHASE 10O-R downstream authorization terminal scrub boundary (Draft)

- Added the terminal-context CHECK and transaction-first terminalization helpers, plus disposable lifecycle, permission, and direct-TCP race acceptance coverage.
- No Production migration/write, provider call, credential, email, Auth, UI, or launch-state change was made.

## 2026-08-13 PHASE 10O-Q dark broker orchestration (local/blocked)

- Started the dark-only validator/orchestrator integration. It freezes a validated client/redirect/S256/state/nonce request into the existing transaction boundary, returns only the opaque broker handle to browser continuity, and keeps direct private-table access out of the orchestration port. Google and Kakao durable OIDC plus Naver recovery isolated flows reached their dark token exchanges without a public route.
- Post-correlation provider failure was blocked because the approved `fail_upstream_login_leg()` path terminalized the attempt as `failed_safe` and the upstream leg as `rejected`, while leaving its bound downstream transaction `upstream_bound` with raw downstream nonce/state. PHASE 10O-R later supplied the approved terminalization/scrub boundary; Q acceptance now resumes against that baseline. No public-route activation is included.

## 2026-08-16 PHASE 10O-Q/S integration (Draft / feature-off)

- PHASE 10O-S is merged at `1ca8fd1d9b74fd66130e2f09ab88d21eae4c1615` and its Production migration is applied feature-off. Q uses its durable resolve/create-or-resume RPCs as the active continuation authority.
- Q/S acceptance passed canonical one-leg recovery across process loss and response loss, two-process races, callback/expiry scrub, Google/Naver/Kakao dark A→E, and provider/callback/session/token failure matrices. Migrations, public activation, login UI, and live provider calls remain zero.

## 2026-08-13 PHASE 10O-P transaction-bound broker-code issuance (local/Draft)

- Added a forward-only code-to-transaction relationship without adding a private table. It is mandatory, one-to-one, and structurally same-attempt constrained. The trusted transaction—not an issuing caller—supplies exact client, redirect, S256 PKCE, nonce/state context, and expiry.
- Bound issuance accepts raw nonce only as a transient equality proof for the frozen transaction and persists only the existing encrypted nonce tuple. Success atomically creates one ready code, advances the attempt and transaction, returns the response state once, and scrubs raw nonce/state. The legacy unbound service path is revoked.
- Disposable lifecycle, permissions, collision/retry, fresh-process restart, and independent backend concurrency acceptance were run locally. No Production migration/write, provider call, public route, UI, Auth, environment, email, or launch-state action was performed.

- The same unapplied migration now includes a minimal service-only trusted-attempt resolver for restart-safe issuance preparation. Fresh Node processes rehydrate both nonce-bearing and no-nonce frozen context; the direct-TCP READY/GO workers also cover expiry-versus-issuance with distinct OS and PostgreSQL backend PIDs.

## 2026-08-13 PHASE 10O-O downstream authorization transaction persistence (local/Draft)

- Added a single private durable transaction table. The database keeps only a domain-separated handle digest; the raw opaque browser handle is ephemeral and cannot select a private transaction ID directly.
- Creation freezes client, exact redirect, response contract, normalized scopes, S256 challenge/method, optional nonce/state, attempt binding, and expiry. A claimed transaction can bind only its own pending upstream leg; a foreign or stale leg is rejected without consuming the valid claimed transaction.
- No Production DB activity, migration apply, public OIDC route, authorization-code issuance, token minting, provider traffic/configuration, Auth, environment, login UI, email, or launch-state action was performed.

## 2026-08-12 PHASE 10O-N opaque public callback correlation boundary (local/Draft)

- Added a feature-off state-only callback primitive. The raw 43-character OAuth state remains browser-only and only its domain-separated digest is persisted; there are no browser-supplied attempt or leg IDs, cookies, sessions, or local storage correlation values.
- Candidate lookup is non-authoritative, followed by attempt then leg locks and re-read. Unknown state is a zero-mutation rejection; a proven state atomically resolves trusted IDs, clears the digest, and makes replay reject. Provider/client/expiry mismatches terminalize and scrub.
- The old by-ID callback claim lost every execute grant. The new state-only RPC is service-only. No public callback route or durable downstream authorization transaction is implemented.

## 2026-08-12 PHASE 10O-M Draft security/resume contract fix (local/Draft)

- `upstream_pending` is now cryptographically and structurally pre-identity: broker subject, digest, key version, and account binding must all be NULL. The live-subject race handler now recognizes only the exact audited index and rethrows every unrelated unique violation.
- Durable callback parsing fails closed on every duplicate query key, provider-hint ambiguity, redirect-query drift, insecure/userinfo/fragment redirects, and registered OAuth response parameter collision.
- Added stateless resume verifiers that reuse PHASE 10O-L pinned RS256/JWKS/issuer/audience validation while checking the stored nonce digest in constant time. Naver remains state-only and returns only its verified `response.id` identity.

## 2026-08-12 PHASE 10O-M durable upstream login-leg boundary (local/Draft)

- Added a feature-off, durable redirect C-leg after the PHASE 10O-L process-local adapter boundary. The private leg has one attempt binding, digest-only state/nonce, encrypted-only OIDC PKCE resume material, RLS/FORCE RLS, and no direct table grants.
- The server-only helper preallocates the leg UUID before encryption. Its distinct injected key and framed AAD bind exact client configuration and all durable identifiers; resume revalidates the decrypted verifier's S256 challenge and nonce comparison is constant-time digest-only.
- Callback claim locks attempt then leg, commits wrong-state/client/provider/expiry terminal outcomes and scrubs C-leg secrets. The direct verified-identity RPC service grant is removed in favor of a callback-claimed leg-bound transition.
- No Production migration, DB operation, public OIDC route, provider request/configuration, credential, login UI, Auth action, email, environment, or launch change is made.

## 2026-08-12 PHASE 10O-L dark upstream provider adapter boundary (local/Draft)

- Added server-only provider adapters for Kakao OIDC, Google OIDC, and Naver OAuth2 behind an injected in-memory-test HTTP transport interface. No tracked application route instantiates an adapter or makes a provider call.
- Kakao/Google prepare an exact-client/exact-redirect code flow with independent state, nonce, and S256 PKCE. Their verifier accepts only configured HTTPS JWKS responses, exact `kid` RSA `RS256` keys, exact issuer/audience, valid `iat`/`exp`, exact nonce, and non-empty `sub`.
- Naver remains explicitly OAuth2-only: it uses state but no OIDC nonce or assumed PKCE, and its minimal successful identity is only non-empty `response.id`. Live client-secret transport is deferred.
- The adapters retain authorization codes and all token material only in request memory, and tests cover provider substitution, replay, malformed/oversize transport responses, exact provider namespace derivation, and public HTTP feature-off isolation. No migration, DB change, provider credential/action, Auth configuration, login UI, email, environment, or Production change was made.

## 2026-08-11 PHASE 10O-I recovery delivery state boundary (local/Draft)

- Added `20260811110000_recovery_delivery_state_boundary.sql` as a new forward-only migration after the Production-applied 10O-H migration; prior migrations remain unchanged.
- Added `private.recovery_delivery_attempts` with RLS/FORCE RLS and direct CRUD grants removed for anon, authenticated, and service role. The ledger retains only verification/attempt IDs, HMAC/version budget material, state, and timestamps.
- The service-only reserve RPC locks the attempt and the address HMAC lock domain, verifies the 60-second, three-per-attempt, and five-per-24-hour budgets before superseding any pending challenge, then inserts the exact preallocated verification and a `reserved` ledger record in one transaction.
- `sent` is an idempotent service transition; `failed` terminally revokes the challenge so existing terminal-secret triggers clear its one-time crypto. The consumed-decision RPC now rejects every delivery state except an exact `sent` row for the supplied challenge.
- Security review hardening makes all required reserve fields and submitted OTP MAC NULL-safe. A successful resend terminalizes an old unsent `reserved` ledger row as `failed` before revocation; stale sent confirmation is rejected with no resurrection or resend.
- Added server-only preparation-to-reserve orchestration with only a deterministic in-memory fake transport. The database adapter never receives raw email or OTP; no real sender, provider request, runtime secret, public route, login UI, Auth user, Production migration, or Production data change is included.

## 2026-08-11 PHASE 10O-H recovery crypto preallocated-ID binding (local/Draft)

- Added `20260811090000_social_recovery_crypto_id_binding.sql` as a forward-only, unapplied migration after the Production-applied 10O-G boundary. It does not edit either historical 10O-F/10O-G migration.
- The service-only recovery creation RPC now consumes supplied `requested_verification_id` and `requested_reserved_account_id` exactly. It rejects an existing challenge, existing account ID, or pending reservation collision; the old DB-generated-ID signature has no service-role execute grant.
- `reserved_account_id` is explicitly not an account. It exists only on a pending attempt-owned `login_decision` challenge and is removed by the same terminal-material trigger that clears HMAC/ciphertext/nonce/OTP material.
- A NEW decision inserts `private_accounts.id = verification.reserved_account_id` and checks the returned ID. Existing/cross-provider recovery matches terminally discard the pending crypto/reservation and never attach a second provider.
- `prepareAttemptRecoveryChallenge` canonicalizes the recovery email, makes the challenge and reservation UUIDs before crypto, uses CSPRNG eight-digit OTP generation, MACs against the challenge UUID, and encrypts against the reservation UUID. Raw email/OTP remain ephemeral delivery-only values.

## 2026-08-10 PHASE 10O-F final contract closure (local/Draft)

- Replaced generic challenge-record AAD with durable account-bound recovery ciphertext AAD: domain + `private_accounts.id` + fixed column purpose + encryption key version. Challenge purge cannot affect future account decryption.
- Enforced UTF-8 byte limits for local part (64) and final IDNA-canonical email (254), added fail-fast pre-DDL migration preflight, made terminal secret emptiness a direct DB CHECK, and made cleanup enqueue return the existing account job for queued, failed-safe, or completed states.
- Added disposable negative preflight validation for an existing private schema, colliding public RPC, and missing launch singleton; no Production migration or mutation was performed.

## 2026-08-10 PHASE 10O-F security-review hardening (local/Draft)

- Modified only the still-unapplied `20260810160000_social_account_recovery_boundary.sql`: cleanup jobs retain an opaque Auth UUID without an Auth FK, survive later private-account deletion, and direct private schema/table access is denied to service role as well as public roles. Only approved SECURITY DEFINER mutation RPCs remain executable by service role.
- Restored the frozen 8-digit numeric OTP contract; activation is the only implemented recovery mutation purpose; new activation challenges revoke and clear their predecessors; every terminal challenge clears one-time HMAC/ciphertext/nonce/key-version/OTP-MAC material.
- Tightened exact `slb:v1:kNN:provider:43-char-base64url` checks, key-version/provider agreement, complete active-row checks, ciphertext minimum length, unquoted local-part validation, and length-framed AES-GCM AAD. Documented the maintenance-closed single-current-version HMAC rotation procedure.

## 2026-08-10 — PHASE 10O-F local/Draft implementation

- Added the unapplied `20260810160000_social_account_recovery_boundary.sql` migration. It places social account, registry, recovery challenge, and cleanup queue tables in a non-public `private` schema with RLS, FORCE RLS, direct grant removal, immutable primary identity triggers, and service-only `SECURITY DEFINER` transitions.
- Added a server-only-by-placement recovery domain layer. It preserves the frozen recovery local-part contract, uses IDNA/lowercase only for the domain, and accepts only synthetic test keys; it does not read environment secrets or send email.
- Disposable PostgreSQL verification returned `PHASE10O_F_LIFECYCLE_OK`, `PHASE10O_F_PERMISSIONS_OK`, `PHASE10O_F_CONCURRENCY_OK`, and `PHASE10O_F_ISOLATED_DB_OK`. The container was removed. Production migration, DB mutation, environment/Auth/provider changes, real email/OTP, and login UX changes remain zero.

## 2026-08-04 — PHASE 10N-E GoTrueClient lifecycle and mobile Preview (LOCAL / DRAFT)

- Reconfirmed the clean synchronized baseline `main == origin/main == 48f693bc0625c4dabfcb9c974c364292877349b6`, then created `codex/phase-10n-e-gotrue-mobile` without changing dependencies, lockfiles, environment files, migrations, Production data, or launch state.
- In a fresh browser tab, `/search` loaded without a warning until entering `진명` activated autocomplete. That import path (`SchoolSearchResults` -> `lib/api/search.ts` -> `lib/supabase.ts`) instantiated both exported anon clients in the same browser context and produced exactly one `Multiple GoTrueClient instances detected` warning under the same storage key. A fresh tab and the interaction boundary ruled out extensions and stale sessions.
- Added a browser-context global singleton for the public anon/RLS client. Browser imports of `supabaseServer` now alias that client; server rendering still receives stateless anon clients, and authenticated clients in `lib/user-auth.ts` remain request-scoped.
- Regression tests prove repeated helper calls and separate browser consumers invoke the factory once, while authenticated server clients remain distinct. Targeted Vitest passed `6 files / 40 tests`; full Vitest passed `115 files / 1,012 tests`; TypeScript and the 58-page/route Production build passed. `npm run lint` stopped at the repository's existing interactive ESLint setup prompt, so no unapproved lint configuration was created.
- Fresh post-fix autocomplete produced zero console warnings/errors and zero GoTrueClient warnings. After the first old-to-new HMR transition, a second fixed-module HMR produced no additional client warning, confirming the stable slot survives repeated module evaluation.
- Draft PR #40 produced automatic Vercel Preview deployment `GRAgyJ8poYn77hQdiWzDFJEDoCch` (GitHub deployment `5743431289`) successfully for head `bb41e60a9febf975ca2be9015eb0ec1cbf1e562a`. The authenticated in-app Preview browser passed school autocomplete and the Seoul High School Hub privacy state with console Warning 0, Error 0, and duplicate GoTrue warning 0.
- A fresh Playwright 360 context reached Vercel's protection login rather than the application; the same protected deployment cannot be measured in isolated 360/390/412 app contexts without a separate authorized session or bypass mechanism. No cookie/profile/session inspection, protection setting change, or bypass was attempted. Therefore direct mobile Preview verification remains blocked rather than being reported as passed.
- No Production deploy, migration, DB/state/environment mutation, OTP, Auth user, PASS execution, Ready transition, or merge occurred.

## 2026-08-04 — PHASE 10N-D Production closed baseline

- PR #39 was squash-merged as `48f693bc0625c4dabfcb9c974c364292877349b6`; that exact application commit was deployed to Production and migration `20260803120000_public_account_soft_launch.sql` was applied once.
- The Production launch singleton remains `closed` with `account_registration=false`, `private_profile=false`, and `school_membership=false`. Launch-created Auth users, private profiles, and school memberships remain zero, while ordinary public registration and all dormant people/connection/message surfaces remain prohibited.
- PHASE 10N-E starts from this frozen baseline and authorizes only a local fix, Draft PR, and Preview verification.

## 2026-08-04 — PHASE 10N-C2 emergency boundary and provider matrix (LOCAL / DRAFT)

- Reproduced a real local provider defect: during public `emergency_stopped`, an active controlled-beta account saw disabled UI but `/api/account/eligibility` still returned 200 because routes evaluated public-or-beta features without first requiring the shared access-active gate.
- Added `hasPublicAccountWriteAccess`, which requires `public_account_access_active` before public or beta feature access, and applied it to eligibility, consents, profile, memberships, and onboarding writable state. Owner deletion and account-deletion privacy rights remain separately governed.
- Preserved `closed` active-beta access, `open` beta one-school precedence, emergency public/beta write closure, and fresh-readiness requirements after emergency. Hardened the disposable harness with project-isolated launch state, one-read readiness parsing, actual membership fixtures, and response-aware local timing without weakening Production assertions.
- Verified targeted Vitest `8 files / 54 tests`, full Vitest `114 files / 1,008 tests`, TypeScript, the Next.js 15.3.8 Production build with 58 generated pages/routes, 18 isolated drift/rollback scenarios, and PHASE 10J/10N lifecycle and permission checks. Isolated final baseline: `0|0|0|0|10006|0|0|closed`.
- The modified-head provider matrix passed `20/20`: Chromium `5/5`, mobile 360 `5/5`, mobile 390 `5/5`, mobile 412 `5/5`, workers 1, retries 0. It used local PostgreSQL/PostgREST/GoTrue/Mailpit, synthetic UUIDs, and `@example.invalid` only; external email and Production Auth were 0. Forced provider deletion failure reached `failed_safe`, retry succeeded, Auth identity deletion was confirmed, and the final provider baseline was `0|0|0|0|10006|0|0|0|0`.
- Canonical-LF migration SHA-256: `5DF7F3E489D91C18328524C0AA1ACA3F10276F0700604FD27433F68228854A48`. No Production migration, deployment, state/data/environment mutation, real-person Auth/OTP, school selection, beta/commercial operation, Ready transition, or merge occurred.

## 2026-08-03 — PHASE 10N-B public account security hardening (LOCAL / DRAFT)

- Started from Draft PR #39 head `612a989f9a1ee8b87c2d9c8d33626d92f760e0e7` with a clean, synchronized branch and the read-only post-reset Production baseline unchanged. Migration `20260803120000` remained the only pending migration.
- Hardened the unapplied migration with an exact 68-table/UUID-link/post-reset preflight before permanent DDL, an exact 71-table postflight, one explicit transaction, and isolated rollback scenarios for every required data/schema drift plus partial and forced-middle failure.
- Removed authenticated direct writes to consent, deletion request, private profile, and school membership. Fixed-contract SECURITY DEFINER owner RPCs now derive `auth.uid()`, enforce launch-or-beta access, adult/consent/deletion rules, normalized input, protected fields, duplicate/limit checks, and advisory locking.
- Split query-free request activity from account-first milestones. Actual school results increment activity; page render and autocomplete do not. Adult, consent, profile creation, first school, onboarding completion, OTP verification, and deletion request are idempotent first-transition milestones; `return_session` remains absent.
- Fixed public-closed controlled-beta account UI compatibility while preserving the one-school beta contract. Generic state mutation cannot set ready/open; immutable evidence and a separate fresh-readiness open RPC are required, including after emergency recovery.
- Implemented actual two-system deletion with `pending → public_data_deleted → auth_deletion_pending → done`, `failed_safe` on Auth provider failure, immediate account blocking, Auth Admin hard-delete before completion, and 90-day purge of deidentified request/audit evidence.
- This section preserves the pre-C2 implementation history. Its intermediate validation counts, earlier digest, and provider-blocked conclusion were superseded by the 2026-08-04 C2 entry above.

## 2026-08-03 — PHASE 10L-F Production legacy person data reset

1. **적용 전 검증:** clean `main`/`origin/main`과 Production deployment가 PR #37 squash merge commit `3d56ffe33c5f20abf44542c603bf3009708b5339`로 일치함을 확인했다. Production 집계는 `profiles=25`, `reports=1`, `traces=8`, `search_logs=670`, `schools=10006`이었고 신규 개인 데이터, editorial account 연결, 실제 beta 운영 데이터, scoped beta flag, commercial row는 모두 0이었다. public table 계약은 68 = 삭제 4 + 보존 64였다.
2. **CLI dry-run:** repository tracked file을 변경하지 않는 Supabase CLI `2.111.0`으로 linked Production project를 확인했다. 적용 이력 15건과 최신 version `20260730100000`을 확인한 뒤 dry-run에서 pending 대상이 `20260802120000_legacy_person_data_reset.sql` 한 건뿐임을 확인했다. canonical LF SHA-256은 `859732AE6FE22AD06FD257FAD254E5ED8DC0622364493B21FD00EA4D8E2190AB`였다.
3. **실제 migration 적용:** active client session과 대상 legacy table lock 조회가 모두 0행일 때 동일한 CLI의 `db push --linked`로 migration 한 건만 적용했다. exit code는 0이었고 자동 재시도, SQL Editor DELETE, seed, reset, migration history 조작은 없었다.
4. **적용 직후 집계:** `profiles=0`, `reports=0`, `traces=0`, `search_logs=0`, `schools=10006`, school growth drift 0, ranking rows 0을 확인했다. 신규 개인 데이터, editorial account 연결, 실제 beta 운영 데이터, scoped beta flag, commercial row는 0을 유지했고 beta program 1개와 global beta flag 8개를 보존했다. migration의 transaction 내부 table-by-table 검증에서 보존 대상 64개 테이블의 행 수가 변하지 않았다.
5. **drain 후 재검증:** 공식 학교 검색과 legacy API smoke 뒤 다시 집계해 네 legacy 테이블이 모두 0임을 확인했다. stale writer에 의한 재생성은 없었다.
6. **권한 및 RLS 확인:** legacy table RLS 4/4와 `private_profiles`·`beta_programs` FORCE RLS를 유지했다. PUBLIC/anon/authenticated legacy INSERT table grant, column grant, INSERT policy, 공개 실행 가능한 legacy write RPC는 모두 0이었고 service-role raw `search_logs` 권한도 없었다.
7. **공식 도메인 smoke:** Home과 School Hub는 200, 학교 검색은 정상, 개인 명단은 비노출이었다. `/people/search`와 `/account`는 로그인으로 이동했고 stale profile URL은 404였다. sitemap은 200이며 person 경로가 없었다. `/api/profiles`, `/api/reports`, `/api/traces`는 payload 처리나 DB persistence 없이 고정 503을 반환했다.
8. **Vercel Runtime 확인:** Current Production deployment의 commit 일치를 다시 확인했다. 확인한 runtime 구간의 Warning, Error, Fatal은 각각 0이었고 의도된 legacy API 503 외 비의도 5xx는 0이었다.
9. **저장소 무변경 상태:** Production 실행 중 source, migration, package, lockfile, environment file을 변경하거나 commit·push·수동 재배포하지 않았다. 종료 시 `main`과 `origin/main`은 동일했고 작업 트리는 clean이었다.
10. **beta 미시작 상태:** target school은 `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`이다. 실제 beta Draft, snapshot, allowlist, program-scoped flag, readiness, invite, member, OTP, 메시지, Instagram 작업과 promotion/order/payment 작업을 생성하거나 실행하지 않았다. 기존 등록자를 조회·연락·전환·재사용하지 않았다.

Final status: `PHASE_10L_F_PRODUCTION_LEGACY_PERSON_DATA_RESET_COMPLETE`.

## 2026-08-02 — PHASE 10L legacy person data reset (local implementation)

- Created branch `phase/10l-legacy-person-data-reset` from clean `main`/`origin/main` `09e632cdfa040d1695e374b1c464fc6a9dcd2a9a`.
- Performed a Production read-only aggregate/catalog audit without outputting person content. Found 25 unowned legacy profiles across 13 schools, 1 linked report, 8 standalone traces across 5 schools, and 670 raw search logs. Schools remain 10,006, all at stored level 1 with no level timestamp.
- Confirmed new private profiles, adult/consent records, memberships, connections, messages, Instagram permissions, safety rows, real beta operation rows, program/user-scoped beta flags, promotion/order rows, and payment rows are all zero. Preserved definitions are one legacy beta program and eight global flags. A follow-up catalog audit classified all 68 Production public tables as 4 delete + 64 preserve and froze the complete UUID person-link column contract.
- Confirmed the only FK to legacy `profiles` is `reports.profile_id ON DELETE CASCADE`; traces link only to schools, search logs optionally link only to schools, and profiles link to schools plus optional auth owner. No view or materialized view reads profiles.
- Added `20260802120000_legacy_person_data_reset.sql`. It locks all 68 classified tables in deterministic order, accepts only the exact audited Production baseline, rejects an all-zero replay, deletes reports/traces/search logs/profiles in dependency order, normalizes affected school growth state, verifies empty ranking output, and commits atomically.
- Added `safety_account_restrictions` to the person-data guard and preservation checks. Any `editorial_features.account_id` row, new/unclassified person-link UUID column, beta operation, advertising, order, payment, or public table drift aborts before deletion.
- Permanently closed legacy raw writes: the app no longer stores school-search queries, raw `search_logs` INSERT is revoked for PUBLIC/anon/authenticated (including column grants) and service-role raw access is removed; profile/report/trace public API, RPC, policy, and grant boundaries are asserted closed. Privacy-safe search telemetry is deferred to a separate design.
- Expanded disposable PostgreSQL validation to independent success and rollback databases for profile, safety, editorial, beta, advertising, order, payment, unclassified-table, forced mid-delete failure, and zero-row replay cases. The browser suite now builds and runs Next.js against the actually reset disposable database through PostgREST on Chromium and mobile 360/390/412.
- PHASE 10L-C verification passed: related tests 5 files / 24 tests, full suite 110 files / 980 tests, TypeScript, 59-page Production build, isolated PostgreSQL lifecycle/permissions/PHASE 10J regression, and all independent rollback scenarios. Reset-database-backed Playwright passed 20/20 on Chromium and mobile 360/390/412; post-browser counts remained legacy rows 0 and schools 10,006.
- Production migration, merge, deployment, school choice, beta operations, invitation, communication, promotion, order, and payment were not executed. Production still contains the audited legacy rows pending separate approval.

## 2026-08-02 — PHASE 10K limited beta readiness audit (documentation only)

- Confirmed local `main` and `origin/main` at `d8ab78a308dae7e796eb16601303e4b392fcee93` with a clean starting worktree.
- Used the existing authenticated Vercel dashboard session read-only; the `schoollove-kr` Production Logs page was accessible without new credentials and its visible last-30-minute filter showed 0 warnings, 0 errors, and 0 fatal entries.
- Audited minimum runtime-log access, containment-first incident handling, migration `20260730100000` rollback impact, active-transition prerequisites, target-school selection, invite/member/stop/reactivation order, expected Production rows, and privacy/minor/school-scope boundaries.
- Added `docs/decisions/2026-08-02-limited-beta-readiness-audit.md` and synchronized the first-beta start and stop/rollback runbooks. No code, test, package, environment, or migration file was changed.
- Created or changed no Production Draft, snapshot, allowlist, program, flag, readiness, invite, member, profile, school history, OTP, message, Instagram permission, promotion, order, or payment. No deployment or Production setting changed.
- Final audit status: `PHASE_10K_LIMITED_BETA_READINESS_AUDITED_NO_PRODUCTION_WRITES`.

## 2026-07-30 — PHASE 10J first controlled beta safety boundaries (Production/Merged)

- Added migration `20260730100000_first_controlled_beta_safety_boundaries.sql` without changing any previously applied migration.
- Bound setup Drafts, immutable setup snapshots, beta members, and a new immutable `beta_program_schools` allowlist to one validated school UUID. Free-text `target_scope` remains descriptive only.
- Replaced the first-beta setup contract with exact DB and app validation: 20 members, 14 days, one school, one-use/seven-day invites, approval waitlist, mandatory privacy/RLS/health stops, and only `account_registration` plus `private_profile` enabled.
- Added idempotent, service-role-only feature configuration and atomic start. Activation remains a paused-program creation step; only `admin_start_controlled_beta_program()` can transition an eligible snapshot-backed program to `active` and append its audit record.
- Made emergency stop pause snapshot-backed active programs. Generic emergency clearing fails closed; `admin_reactivate_controlled_beta_program()` requires a readiness record created after the stop and rechecks the complete contract before audited restoration.
- Restricted invite issue, redemption, member approval, and private school-history writes to the active immutable school contract. Outstanding invites plus occupied member capacity cannot exceed 20.
- Removed global feature mutation and generic restore from administrator UI. School search returns only minimal school metadata, start controls appear only when readiness is complete, and invite UI lists only eligible programs.
- Targeted validation passed: 4 files / 24 tests. Full validation passed: 109 files / 1012 tests, TypeScript, and the 59-page Production build.
- The isolated PostgreSQL suite returned `PHASE10J_LIFECYCLE_OK`, `PHASE10J_PERMISSIONS_OK`, and `PHASE10J_ISOLATED_DB_OK`. It exercised atomic rollback, idempotent activation/start, immutable school scope, exact flags, invite policy/capacity, member approval, authenticated school writes, emergency stop, fresh readiness, reactivation, RLS, and grants.
- Chromium and mobile 360/390/412 E2E passed 11 tests for administrator-only routes, safe 400/409 errors, row-free synthetic guidance, school selection, paused creation, flags, readiness, active start, eligible invite display, emergency stop, reactivation, private robots, responsive layout, and closed public registration. Nine duplicate mobile executions of project-independent API-only checks were intentionally skipped.
- Production migration `20260730100000_first_controlled_beta_safety_boundaries.sql` was applied, PR #35 was squash-merged, and merge commit `d8ab78a308dae7e796eb16601303e4b392fcee93` was deployed to Vercel Production.
- Production migration history, changed database objects, RLS/FORCE RLS, grants, role boundaries, public pages, and existing read flows passed non-destructive verification.
- School selection and real Draft/program/snapshot/allowlist/flag/readiness/invite/member, OTP, message, Instagram permission, promotion, order, and payment were not executed. Existing Production data was not changed.
- Final status: `PHASE_10J_PRODUCTION_APPLIED_AND_MERGED_NO_BETA_DATA`; target school remains `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`.

## 2026-07-30 — PHASE 10J-A first controlled beta preflight (audit only)

- Verified local `main` and `origin/main` at `5215ec7a85653500fe312e01640d13f5ce3f4a0f` with a clean starting worktree, then performed a read-only Production and current-code audit.
- Confirmed aligned Production migration history through `20260729190000`, all 8 PHASE 10I operation tables, 25 unchanged public profiles, and 10,006 unchanged schools.
- Confirmed the single legacy program `limited_beta_2026` remains active with no emergency stop, end time, invite, member, setup snapshot, program flag, or campaign. All eight global feature flags remain enabled.
- Determined `NEW_PROGRAM_RECOMMENDED`; the legacy readiness seed must not be modified or reused for the first real beta.
- Found no dedicated atomic `paused` to `active` administrator RPC and no enforceable program-school contract. `target_scope` is text, campaign school is optional metadata, and invite issuance currently accepts paused or snapshotless programs.
- Defined PHASE 10J-B remediation and the operator decision gates in `docs/decisions/2026-07-30-first-controlled-beta-plan.md`.
- Created no Production program, Draft, snapshot, feature flag, invite, member, OTP, message, Instagram permission, promotion, order, payment, or environment change. The real beta has not started.
- Final audit status: `PHASE_10J_PREFLIGHT_BLOCKED_IMPLEMENTATION_REQUIRED`.

## 2026-07-29 — PHASE 10I controlled beta operations (Production)

- PHASE 10I-R connected setup drafts to an immutable activation snapshot. `max_users`, `target_scope`, `enabled_features`, `invite_policy`, `approval_waitlist_enabled`, and mandatory stop conditions are copied in the same transaction as the paused program and audit log.
- Draft-key edits now persist before activation; another draft or existing program key produces an explicit safe conflict. Activation retries return the existing program and cannot duplicate the program or snapshot.
- Snapshot capacity is enforced during invite redemption and member approval, invite limits during manual invite issue, and allowed features during flag mutation and effective access checks. Activation still creates no invite, enabled feature flag, public launch, OTP, message, payment, or advertising order.
- Recorded `docs/decisions/2026-07-29-controlled-beta-operations.md` before implementation.
- Added migration `20260729190000_controlled_beta_operations.sql` for setup drafts, immutable program setup snapshots, operator notes, feedback, tasks, campaigns, masked aggregates, readiness snapshots, RLS/FORCE RLS, and audited service-role RPCs.
- Added `/admin/beta/setup`, `/users`, `/schools`, `/advertisers`, `/tasks`, `/readiness`, and `/report`.
- Added signed-in active-beta feedback without automatic HTML, token, cookie, message, search-text, or personal-identifier attachment.
- Added synthetic mode requiring an explicit non-Production environment flag.
- Final security review made the synthetic lifecycle screen strictly read-only: it no longer renders real setup forms or mutation controls, and the membership helper rejects attempts to test another user's UUID.
- Relevant tests passed: 3 files / 19 tests. Full tests passed: 108 files / 1001 tests. TypeScript and the 59-page Production build passed.
- The isolated PostgreSQL lifecycle/RLS/grant suite returned `PHASE10I_ISOLATED_DB_OK`; Chromium and mobile 360/390/412 E2E passed 12 tests, including private admin routes, row-free synthetic mode, and private feedback.
- Applied Production migration `20260729190000_controlled_beta_operations.sql`; migration history is aligned and all 8 new tables have RLS/FORCE RLS enabled.
- Squash-merged PR #32 at `8352036ce58e510364fb3a830124b2d41ce58e4e` and completed the Vercel Production deployment and official-domain smoke verification.
- Production lifecycle, permissions, non-member feedback rejection, service-role RPC, private-cache/SEO, and synthetic-mode 404 checks passed.
- Preserved 25 public profiles, 10,006 schools, and all existing connection, message, Instagram-permission, promotion, order, and payment data. No ownership was assigned.
- Created no PHASE 10I operational data and no new program, invite, member, or feature flag. The existing program and feature flags were unchanged.
- Final status: `PHASE_10I_PRODUCTION_APPLIED_AND_MERGED_PAUSED`.
- Program activation, invite creation or delivery, OTP, messages, Instagram permissions, advertising, payments, and Production environment changes remain separately approved operations. Every newly created beta program must start `paused`.

## 2026-07-29 — PHASE 10F 제한 베타 운영 준비

- OTP·성인·필수 동의 뒤 해시 초대와 운영자 승인을 요구하는 제한 베타 프로그램, 회원, 기능 flag, append-only audit 경계를 추가했다.
- 비공개 프로필·사람 찾기·연결·메시지·Instagram 승인·프로모션 기능을 기능별로 차단하며 프로그램 비상 정지를 지원한다.
- KST 현재 연도보다 미래인 졸업연도를 API와 DB trigger에서 거부한다.
- idempotent daily maintenance, 운영 작업 기록, 보존 정책 version, aggregate event counter, incident, owner-only export queue를 추가했다.
- 관리자 운영 상태 화면, 관리자 전용 health, `CRON_SECRET` 보호 cron, 관리자 로그인 rate limit을 추가했다.
- 합성 데이터 전용 PostgreSQL 전체 migration 적용, 베타 lifecycle rollback smoke, 권한 smoke를 통과했다. Production 적용 상태는 배포 후 별도로 기록한다.

### Production 적용 및 검증

- PR #29를 squash merge하고 merge commit `98882aa04615b08d020f35d0651c51bc94cce845`를 Vercel Production에 배포했다.
- PHASE 10F migration을 Production DB에 적용했다. 기존 공개 profile 25건을 변경하지 않았고 private/connection/promotion domain row는 0건이었다.
- 신규 10개 table의 RLS/FORCE RLS, anon/authenticated 권한 0건, service-role 경계와 제한 베타 프로그램 생성을 원격에서 확인했다.
- 공식 도메인 `/`, `/search`, `/submit`은 200, 미인증 admin/health/cron 경계는 401, 공개 `POST /api/profiles`는 503을 확인했다.
- Vercel Cron은 `/api/cron/operations`, `0 18 * * *`로 활성화했다. 운영 job row를 만드는 수동 Run은 실행하지 않았다.
- PHASE 10E migration table은 운영에 존재하지만 migration history row가 확인되지 않는 상태를 남은 운영 위험으로 기록한다. 임의 history 보정은 수행하지 않았다.
- 최종 상태: `PHASE_10F_PRODUCTION_APPLIED_LIMITED_BETA_READY`.

## 2026-07-29 — PHASE 10G 결제 Provider Sandbox (Local/Draft)

### 구현

- 국내 PG 연동 확장성과 공식 V2 결제 조회·취소·Standard Webhooks 계약을 기준으로 PortOne V2 sandbox를 선택했다. 실제 Production credential은 등록하거나 사용하지 않았다.
- provider-neutral `PaymentProvider` 계약과 manual, mock, `portone_sandbox` adapter를 구현했다. Production에서는 mock provider가 fail-closed 된다.
- 서버 저장 주문 금액·통화·소유권과 provider 재조회 결과가 모두 일치할 때만 결제 완료를 확정한다. 브라우저 callback 성공만으로 결제를 신뢰하지 않는다.
- 결제 시도 idempotency, webhook 서명·5분 timestamp·replay 방어, 원문 대신 SHA-256 payload hash, 취소·부분/전체 환불, 증빙 요청과 관리자 재처리 경계를 추가했다.
- 결제·webhook·환불·증빙 table에 RLS/FORCE RLS를 적용하고 owner 최소 조회와 service-role mutation만 허용했다.
- owner 결제 UI/API, 관리자 결제 queue, health 집계와 owner 데이터 export를 추가했다. 결제 페이지도 서버 로그인·만 19세 이상·필수 동의 경계 뒤에 두고 private robots를 유지했다.
- 자동 결제 활성화, Production webhook 등록, Production 환경변수, 실제 결제·취소·환불은 이번 단계에서 수행하지 않았다.

### 검증

- 최종 감사에서 provider 조회의 주문 ID·store ID·TEST channel 결합 검증, RFC 형식 취소 idempotency header, 외부 환불 전 DB 한도 예약을 보강했다.
- Production은 명시적인 server/client provider mode가 없으면 결제 CTA·외부 SDK·provider가 모두 비활성이다. 결제 확인·증빙·페이지에도 제한 베타·성인 경계를 일관되게 적용했다.
- PHASE 10G 관련 테스트 5 files / 19 tests를 통과했다.
- 전체 테스트 102 files / 968 tests, TypeScript, Next.js 15.3.8 Production build(54 static pages), `git diff --check`를 통과했다.
- Production과 분리된 일회성 PostgreSQL에서 PHASE 10A→10B→10C→10D→10E→10F→10G migration, 금액 변조 거부, idempotent 중복 요청, webhook replay 방어, 부분·전체 환불, RLS/grant를 검증했다. 최종 결과는 `PHASE10G_PAYMENT_LIFECYCLE_OK`, `PHASE10G_PAYMENT_PERMISSIONS_OK`, `PHASE10G_ISOLATED_DB_OK`이며 컨테이너를 제거했다.
- Production build 서버에서 Chromium desktop과 360/390/412 mobile viewport 4개 E2E를 통과했다. 미인증 owner/admin API, 잘못된 webhook, 비공개 결제 페이지가 fail-closed이고 horizontal overflow가 없음을 확인했다.
- 로컬 E2E의 Upstash 환경변수 미설정 경고는 예상된 로컬 경고이며 보호 경계는 fail-closed로 동작했다. 비밀값은 읽거나 출력하지 않았다.
- 상태: `PHASE_10G_LOCAL_VERIFIED`; Production 적용은 금지하고 Draft PR까지만 진행한다.

## 2026-07-28 — PHASE 10C Safe Connection Messaging (Local/Draft)

### Implementation

- Added exact school + graduation year + display-name matching through a service-only RPC that returns only a minimal state and short-lived opaque match token.
- Added immutable first greetings (200 characters), a single atomic reminder after seven days, receiver accept/decline/not-the-person/block/report actions, and atomic connection creation.
- Added accepted-connection text messaging (500 characters), read state, disconnect/block/report boundaries, and per-counterparty Instagram visibility approval and revocation.
- Centralized URL, email, phone and external contact-pattern rejection in client/server policy and DB checks.
- Added IP/account hashed fail-closed rate limits for discovery and all connection mutations.
- Added generic in-app notifications without message/name/school/Instagram payloads and a minimal admin safety list with atomic audit RPC actions.
- Added RLS/FORCE RLS to all nine PHASE 10C private tables and kept every mutation RPC service-role only.
- Added noindex private pages and kept every new private route out of the sitemap.

### Deployment boundary

- PHASE 10C migration has not been applied to Production.
- PHASE 10C PR must remain Draft and must not be merged or deployed without a separate approval.
- Email notifications, attachments, realtime sockets, Today Instagram advertising and payment remain out of scope.

### Verification

- PHASE 10C targeted verification passed: 6 files, 54 tests.
- Full local test suite passed: 83 files, 890 tests.
- TypeScript (`tsc --noEmit`) passed.
- Next.js 15.3.8 Production build passed with 37 generated pages and all PHASE 10C routes present.
- Local build emitted only the known missing-local-Upstash warnings; the Production runtime path remains fail-closed when those variables are absent.
- Final diff and `git diff --check` are recorded before the Draft PR is opened.

## 2026-07-24 — Year Hub People Discovery

### Implementation

- Reordered Year Hub so the complete same-year people list and local nickname search appear before class navigation.
- Added real total-person context while preserving the existing 500-profile Year Hub cap and client-only partial nickname matching without URL query exposure.
- Reordered Class Hub around its people list or empty state, followed by one context-preserving registration CTA and the existing year navigation.
- Added validated `/submit` prefill handling for school, year, grade, and class without auto-submission.
- Replaced public profile-card `select('*')` queries with an explicit minimal public field contract while preserving filters, ordering, and Class Hub pagination.
- Kept Instagram, edit/delete, and report actions and ensured primary profile-card and search-clear controls have at least 44 by 44 pixel hit areas.

### Verification

- Targeted Year, Class, Submit, profile-card, and public-profile API tests passed locally: 8 files, 98 tests.
- TypeScript passed locally.
- Full test suite passed locally: 62 files, 844 tests.
- Production build and `git diff --check` passed locally.
- Actual Next.js pages were checked with isolated Edge profiles at 1440, 1024, 412, 390, and 360 pixels, including populated, filtered, zero-result, empty-state, and submit-prefill flows.
- No horizontal overflow or clipped elements were found; fixed mobile navigation did not cover page content at the document bottom.
- Status: LOCAL_VERIFIED

### Notes

- No database, migration, Supabase policy, API mutation, authentication, ranking, growth, font, color, or remote-service changes.
- No Production access or write was performed.

---

개발 구현 진행 상황을 기록합니다.

Decisions는 "왜 이렇게 결정했는가"를 기록합니다.

Implementation Log는 "실제로 무엇을 구현했는가"를 기록합니다.

---

## 2026-07-22 — Phase 10G-H

### Implementation

- Restored the optional per-person registration message input so it is visible without waiting for a nickname.
- Aligned the field label, placeholder, maxlength counter, and per-person state handling with the existing `POST /api/profiles` message contract.
- Kept payload normalization at the existing boundary: trimmed messages are sent, and blank messages become `null`.
- Added a self-hosted NeoDunggeunmo webfont for small retro RPG-style HUD labels while keeping large Korean headings and school names black.
- Replaced remaining large semantic color emphasis on Home with black/deep-navy typography and limited neon accents to small labels, numbers, status chips, and progress bars.
- Removed the external Pretendard runtime CDN dependency from the root layout.

### Files

- app/globals.css
- app/layout.tsx
- app/page.tsx
- app/retroTypographyColorSystem.test.ts
- app/submit/page.tsx
- app/submit/personFormState.ts
- app/submit/page.test.ts
- app/submit/personFormState.test.ts
- app/submit/registerPeople.test.ts
- components/CurrentSchoolRanking.tsx
- components/CurrentSchoolRanking.test.ts
- components/HomeActivityItem.tsx
- components/HomeActivityItem.test.ts
- components/RegistrationGrowthRewardCard.tsx
- components/RegistrationGrowthRewardCard.test.ts
- components/SearchBar.tsx
- components/SearchBar.test.ts
- public/fonts/neodgm/LICENSE.txt
- public/fonts/neodgm/neodgm.woff2
- tailwind.config.ts

### Verification

- Targeted submit/profile/home/ranking/search/growth tests passed locally: 15 files, 199 tests.
- TypeScript passed locally.
- Full test suite passed locally: 57 files, 796 tests.
- Production build passed locally.
- `git diff --check` passed locally.
- Edge headless responsive rendering checked locally at 360, 390, 412, and desktop widths for Home, and at 360, 390, and 412 widths for the initial Submit screen.
- Status: LOCAL_VERIFIED

### Notes

- No API route, database schema, migration, RLS, GRANT, CAPTCHA, rate-limit, or remote-service changes.
- No Production registration retry was performed.
- NeoDunggeunmo is bundled from the official v1.601 release. License text is included at `public/fonts/neodgm/LICENSE.txt`.
- Production visual verification has not been performed in this phase.

---

## 2026-07-22

### 구현

- 관리자 프로필 목록이 API의 단수 `school` 관계를 사용하도록 타입·학교 열 렌더링을 정정
- 전체 목록·nickname 검색·학교명 검색·중복 제거 후 학교 관계 보존 회귀 테스트 추가

### 관련 파일

- app/admin/profiles/page.tsx
- app/admin/profiles/page.test.ts
- app/api/admin/profiles/route.test.ts
- lib/api/admin.test.ts

### 검증

- 관련 테스트 3개 파일·29개 통과
- TypeScript 통과
- 전체 테스트 53개 파일·773개 통과
- production build 및 `git diff --check` 통과
- 상태: LOCAL_VERIFIED

### 비고

- 관리자 인증·검색 로직·숨김/복원/삭제 mutation·원격 DB는 변경하지 않음
- Production 관리자 화면 재검증 및 Production profile registration retry는 실행하지 않음

---

## 2026-07-22

### 구현

- Home 저채도 아이보리 시각 체계와 의미 기반 타이포그래피 적용
- Home 공통 배경 토큰을 흰색으로 전환하고 흰색 배경 AA 대비에 맞춰 보조·성장·경고 색상 명도 조정
- 누적 공개 프로필 기준 현재 학교 순위 TOP 3 적용
- 활동 카드를 얇은 구분선 피드로 변경하고 하단 내비게이션 색상 통합

### 관련 파일

- app/page.tsx, app/globals.css, app/layout.tsx
- components/CurrentSchoolRanking.tsx, components/HomeActivityItem.tsx, components/HomeFeedCta.tsx, components/TabBar.tsx
- lib/api/schools.ts, lib/policy/homeFeed.ts, types/homeFeed.ts, tailwind.config.ts

### 검증

- `npm.cmd run typecheck` 통과
- 변경 관련 테스트 67개 통과
- 전체 테스트 772개 통과
- `npm.cmd run build` 통과
- `git diff --check` 통과
- Edge Chromium 360×800 / 390×844 / 412×915 실제 렌더링 및 가로 오버플로우 0 확인
- hosted Supabase의 `school_growth_ranking_v1` 존재와 반환 계약 일치 확인(읽기 전용)

### 비고

- Level Up/순위 이력/LIVE 집계 데이터가 없어 해당 값은 표시하지 않음
- 모바일 검증에서 발견한 헤더·푸터 링크 터치 영역만 최소 44px로 보정

---

## 기록 규칙

각 개발 작업 완료 후 아래 형식으로 기록합니다.

### YYYY-MM-DD

#### 구현

- 구현한 기능
- 변경한 화면
- 수정한 구조

#### 관련 파일

- 변경 파일 경로

#### 검증

- 테스트 결과
- 확인한 상태

#### 비고

- 남은 문제
- 후속 작업

---

## 2026-07-09

### 구현

- Design Package v1.0 개발 기준 확정
- Design Package FROZEN 상태 적용
- Product Principles 문서 추가
- Decisions 기록 구조 추가

### 관련 파일

- docs/design-package-v1.0/
- docs/decisions/

### 검증

- Design Package README 확인
- FROZEN 상태 확인
- Decisions 폴더 구조 확인

### 비고

- 이후 실제 기능 구현 완료 내역부터 순차 기록

---

## 2026-07-09 (2)

### 구현

- Level Policy 순수 모듈 구현 (docs/design-package-v1.0/03-level-policy.md 기준)
- threshold(1) = 0 명시적 예외, L >= 2는 `round(50 * L^1.5)` 공식 적용
- cumulativeXp를 입력받아 LevelState(level, xpIntoLevel, xpForNextLevel, remainingToNext)를 반환하는 `calculateLevelState` 구현
- 음수/NaN/Infinity cumulativeXp 입력을 0으로 클램프하여 음수 레벨이 발생하지 않도록 처리
- remainingToNext가 항상 1 이상의 정수가 되도록 ceil 적용
- 레벨 탐색을 지수 확장 + 이분 탐색으로 구현하여 매우 큰 cumulativeXp에서도 안전하게 동작
- 프로젝트에 테스트 러너가 없어 vitest를 devDependency로 추가하고 `test`, `typecheck` npm script 추가
- calculateLevelState 단위 테스트 11개 작성 (threshold 경계값, 음수/비정상 입력, 매우 큰 값, level >= 1 / remainingToNext >= 1 불변 조건 포함)

### 관련 파일

- types/level.ts (신규)
- lib/policy/levelPolicy.ts (신규)
- lib/policy/levelPolicy.test.ts (신규)
- package.json (`test`, `typecheck` script 추가, vitest devDependency 추가)
- package-lock.json (vitest 설치 반영)

### 검증

- `npx vitest run lib/policy/levelPolicy.test.ts` → 11 passed
- `npx tsc --noEmit` → 오류 없음
- `npm test` (현재 저장소의 유일한 테스트 스위트) → 11 passed

### 비고

- School Hub UI, Home Feed, Register Flow, DB Migration, clicked_school_id 로직은 이번 범위에 포함하지 않음
- 저장된 schools.current_level과의 비교/보존(레벨 하락 방지 저장 규칙, §8)은 이번 순수 계산 모듈 범위 밖이며 별도 구현 필요
- XP Source 연결(등록 1명 = 1 XP 등)은 이번 범위에 포함하지 않음 — calculateLevelState는 cumulativeXp만 입력으로 받음

---

## 2026-07-10

### 구현

- Level 저장/보존 계층 구현 (docs/design-package-v1.0/03-level-policy.md §8 기준)
- 순수 판단 함수 `resolveLevelUpdate(storedLevel, newState)` 구현 — Level 공식은 재구현하지 않고 `calculateLevelState()` 결과만 입력으로 받음
- 저장 판단 결과 계약 `LevelPersistenceDecision { level, shouldPersistLevel, levelIncreased }` 정의
  - `storedLevel = null`(미초기화/backfill 상태) → 최초 계산 Level 저장은 초기화이며 Level Up이 아님 (`shouldPersistLevel: true`, `levelIncreased: false`)
  - 저장된 유효 Level N → 더 높은 Level M(M > N) → 실제 Level Up (`shouldPersistLevel: true`, `levelIncreased: true`)
  - 그 외(하락 포함) → 변경 없음 (`shouldPersistLevel: false`, `levelIncreased: false`)
- FROZEN 문서 §8이 null 초기화와 실제 Level Up의 경계를 명시하지 않던 정책 공백을 확인하고, 위 판단 기준을 §8에 최소 문구로 명시함 (기존 학교 최초 backfill 시점이 "최근 레벨업" 신호를 오염시키지 않도록 하기 위함)
- Supabase I/O wrapper `syncSchoolLevel(schoolId, cumulativeXp)` 구현 (`lib/api/levels.ts`)
  - `calculateLevelState`는 최초 1회만 호출, 판단은 매 재시도마다 `resolveLevelUpdate`로 재실행
  - null 초기화는 `current_level IS NULL` 조건부 UPDATE로 `current_level`만 저장 (`level_updated_at` 미포함)
  - 실제 Level Up은 `current_level < target` 조건부 UPDATE로 `current_level`과 `level_updated_at`을 함께 저장
  - 조건부 UPDATE가 경쟁으로 0건이 되면 즉시 실패 처리하지 않고 최신 row를 refetch하여 `resolveLevelUpdate`로 재판단 후 재시도 (bounded retry, `MAX_RETRIES = 5`)
  - null 초기화 경쟁 시 낮은 target이 먼저 반영되어도, 재판단을 통해 결국 더 높은 target으로 수렴함을 시나리오 주석과 테스트로 확인
  - read error / init update error / increase update error / refetch error / retry 소진 모두 `null` 반환으로 통일 (완료되지 않은 상태를 정상 row처럼 반환하지 않음)
- Vitest가 `tsconfig.json`의 `@/*` path alias를 런타임에 resolve하지 못하던 테스트 인프라 공백을 발견하고 `vitest.config.ts`에 동일한 alias(`@` → repo root)를 추가해 해결 (기존 테스트들은 전부 `import type`만 사용해 alias가 컴파일 시 제거되는 바람에 이 공백이 드러나지 않았음)
- `resolveLevelUpdate` 단위 테스트 9개, `syncSchoolLevel` 단위 테스트(Supabase mock, 실제 DB 호출 없음) 12개 작성

### 관련 파일

- docs/design-package-v1.0/03-level-policy.md (§8 null 초기화 vs 실제 Level Up 구분 명시)
- types/level.ts (`LevelPersistenceDecision`, `SchoolLevelPersistenceRow` 추가)
- lib/policy/levelPersistence.ts (신규 — `resolveLevelUpdate`)
- lib/policy/levelPersistence.test.ts (신규 — 9 tests)
- lib/api/levels.ts (신규 — `syncSchoolLevel` Supabase I/O wrapper)
- lib/api/levels.test.ts (신규 — 12 tests, Supabase mock)
- vitest.config.ts (신규 — `@/*` alias를 Vitest 런타임에서도 resolve하도록 추가)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/levelPersistence.test.ts` → 9 passed
- `npx vitest run lib/api/levels.test.ts` → 12 passed
- `npm test` (전체 스위트: levelPolicy 11 + levelPersistence 9 + levels 12) → 3 test files, 32 passed

### 비고

- Register Flow 연결, XP Source 구현, profile count → XP 계산, School Hub/Home Feed/Feed Event 수정, clicked_school_id 로직, DB migration/RPC/trigger 실행, live Supabase 데이터 수정은 이번 범위에 포함하지 않음
- 기존 `School` 타입은 수정하지 않음 — Level 저장 projection은 `SchoolLevelPersistenceRow`라는 별도 타입으로 분리
- `syncSchoolLevel`은 아직 어디에서도 호출되지 않음 (Register Flow 등과 연결되지 않은 독립 모듈 상태)

---

## 2026-07-10 (2)

### 구현

- SchoolLoveI Level Sync Tool v0.1 — Phase 1: Level Snapshot Read Layer 구현
  - `getSchoolLevelSnapshot(schoolId)` 추가 (`lib/api/levels.ts`) — `current_level`, `level_updated_at`만 읽는 읽기 전용 조회, `syncSchoolLevel`/`resolveLevelUpdate`/`calculateLevelState`는 무수정
  - row 없음과 조회 오류 모두 `null`로 통일하는 단순 계약 유지, 별도 Result 타입 도입하지 않음
- SchoolLoveI Level Sync Tool v0.1 — Phase 2/3: Admin Level Sync Route 계약 설계 및 구현
  - Admin Level Sync Route 구현 완료
  - `POST /api/admin/tools/level-sync`
  - `cumulativeXp` nonnegative safe integer validation (`z.number().int().nonnegative().safe()`)
  - snapshot null → 500 `Snapshot failed`
  - sync null → 500 `Sync failed`
  - before/after는 초기 조회 상태와 최종 저장 상태 (didPersist/changed 필드 없음)
  - 기존 `requireAdmin(request)` 패턴을 그대로 복제해 재검증, 새 인증 체계 도입하지 않음
  - route test 12개 추가

### 관련 파일

- lib/api/levels.ts (`getSchoolLevelSnapshot` 추가)
- lib/api/levels.test.ts (`getSchoolLevelSnapshot` 테스트 5개 추가)
- app/api/admin/tools/level-sync/route.ts (신규)
- app/api/admin/tools/level-sync/route.test.ts (신규 — 12 tests)
- docs/tools/level-sync/00-scope-v0.1.md (신규 — v0.1 범위 문서)
- docs/decisions/2026-07-10-level-sync-xp-safe-integer.md (신규)
- docs/decisions/2026-07-10-level-sync-no-404.md (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- route test 12/12 통과
- 전체 `npm test` 49/49 통과

### 비고

- School Hub UI, Home Feed, Register Flow, DB Migration, clicked_school_id, XP Source, cumulative XP 자동 산출은 이번 범위에 포함하지 않음
- `/admin/tools/level-sync` UI는 아직 구현하지 않음 — 다음 단계는 Phase 4: UI 뼈대 구현 (`docs/tools/level-sync/00-scope-v0.1.md` §11 step 3)
- `getSchoolLevelSnapshot`/`syncSchoolLevel`의 null 계약(row 없음과 오류를 구분하지 않음)으로 인해 Level Sync Route는 404를 만들지 않고 원인 불명 실패를 전부 500으로 처리하기로 결정함 (decision 문서 참고)

---

## 2026-07-11

### 구현

- SchoolLoveI Level Sync Tool v0.1 — Phase 4: UI 뼈대 구현
  - `/admin/tools/level-sync` 페이지 구현 — 검색 → 선택 → 상세 표시
  - 학교 이름 검색: `searchSchools(query, 10)` 재사용
  - School ID 직접 조회: `getSchoolById(id)` 재사용
  - 선택된 학교 기본 정보 표시(school_name/school_type/sido·sigungu/slug/id)
  - 저장된 `current_level` / `level_updated_at` 표시
  - `getSchoolLevelSnapshot`은 service role 기반 서버 전용 함수라 클라이언트 컴포넌트에서 재사용하지 않음 — 기존 RLS(`schools_select_all`)와 `app/admin/profiles/page.tsx` 전례에 따라 anon Supabase client로 `current_level`, `level_updated_at` 두 컬럼만 명시적으로 select
  - 신규 조회 API Route는 추가하지 않음
  - sync 실행 UI, cumulativeXp 입력, 계산 미리보기, POST 연결은 포함하지 않음 (Phase 5/6으로 남김)

### 관련 파일

- app/admin/tools/level-sync/page.tsx (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npm test` → 4 test files, 49 tests 통과 (Phase 4는 신규 테스트 추가 없이 기존 테스트 회귀 없음만 확인)
- `.env.local` 부재로 실제 Supabase/admin 로그인 기반 브라우저 smoke test는 미실행
- 학교 이름 검색 결과 표시 / 검색 결과 클릭 선택 / School ID 직접 입력 조회 / 선택 학교 기본 정보 표시 / current_level·level_updated_at 표시 / 검색 결과 없음 상태 / 조회 오류 상태 — 7개 항목은 코드 정적 검토로만 확인, 라이브 브라우저 검증 아님

### 비고

- School Hub UI, Home Feed, Register Flow, DB Migration, clicked_school_id, XP Source, cumulative XP 자동 산출은 이번 범위에 포함하지 않음
- `getSchoolLevelSnapshot`/`syncSchoolLevel`/기존 Route 계약은 수정하지 않음
- 다음 단계는 Phase 5: `calculateLevelState` 클라이언트 미리보기 연결 + 실행 전 확인 화면 (`docs/tools/level-sync/00-scope-v0.1.md` §11 step 4-5)

---

## 2026-07-11 (2)

### 구현

- SchoolLoveI Level Sync Tool v0.1 — Phase 5: cumulativeXp 입력 + 계산 미리보기 + 실행 전 확인 화면
  - cumulativeXp 수동 입력 필드 추가 (XP Source는 아직 미연결이라는 경고 문구 포함)
  - `validateCumulativeXp`로 0 이상 safe integer validation — 빈 문자열은 미입력 상태(에러 아님)로 처리
  - 기존 `calculateLevelState` 재사용 — 계산 로직을 page.tsx에 복제하지 않음
  - 기존 `resolveLevelUpdate` 재사용 — 저장 판단 로직을 page.tsx에 복제하지 않음
  - UI 표시용 `compareStoredAndCalculatedLevel` 4분류(`uninitialized` / `increase` / `same` / `lower`) 추가 — 문구 결정용일 뿐, 실제 persistence 판단은 `resolveLevelUpdate`의 `shouldPersistLevel`/`levelIncreased` 반환값을 그대로 표시
  - 현재 저장 Level과 계산 Level 비교 표시
  - 실행 전 확인 영역 구현(선택 학교/입력 XP/저장 Level/계산 Level)
  - 동기화 실행 버튼은 disabled 상태로만 존재 — POST 연결 없음, DB 저장 없음
  - 학교를 새로 선택하면 `xpInput`을 초기화해 이전 학교의 입력값이 새 학교 미리보기에 남지 않도록 처리

### 관련 파일

- app/admin/tools/level-sync/validation.ts (신규)
- app/admin/tools/level-sync/validation.test.ts (신규)
- app/admin/tools/level-sync/page.tsx (Phase 5 UI 수정)

### 검증

- `npx tsc --noEmit` → 오류 없음
- Phase 5 validation test → 11/11 통과
- `npm test` → 5 test files, 60 tests 통과
- `.env.local` 부재로 실제 Supabase/admin 로그인 기반 브라우저 smoke test는 미실행

### 비고

- 다음 단계는 Phase 6: 실행 버튼 활성화 + 기존 Level Sync Route Handler 연결 + 실행 후 before/after 결과 표시

---

## 2026-07-13

### 구현

- SchoolLoveI Level Sync Tool v0.1 — Phase 6: 실행 버튼 활성화 + Route 연결 + 실행 후 before/after 결과 표시
  - 기존 `POST /api/admin/tools/level-sync` Route를 그대로 재사용 — Route 계약 변경 없음
  - request body `{ schoolId, cumulativeXp }`로 POST 호출
  - 실제 DB update는 client에서 직접 수행하지 않음 — 기존 Route Handler를 통해서만 수행
  - 실행 중 중복 클릭 방지 (`executing` 상태 + 버튼 disabled)
  - 실행 중에는 학교 검색 결과 선택 및 School ID 조회도 차단 — 응답 도착 시점에 다른 학교를 가리키는 race condition을 원천 차단
  - 새 학교를 선택하면 기존 입력값, 실행 결과, 실행 오류를 초기화
  - 새 실행을 시작하면 이전 실행 결과와 오류를 초기화
  - 성공 응답의 `before`/`after`/`cumulativeXp`를 그대로 저장하고 표시 — 실행 후 client에서 Level을 재계산하지 않음
  - 결과 문구는 `before`/`after`의 확정 사실만으로 판단 (최초 초기화 / 실제 저장 Level 상승 / 저장 Level 변경 없음) — 동일 Level과 downgrade 방지는 임의로 구분하지 않음
  - 성공 후 기존 `loadLevelSnapshot(schoolId)`을 재사용해 저장 상태 재조회
  - 실행 결과 패널은 Phase 5 미리보기 조건(`calculatedState`/`decision`/`comparison`)과 독립적으로 유지 — 실행 후 입력값을 바꿔도 결과가 사라지지 않음
  - 실패 시 `xpInput`과 기존 미리보기는 그대로 유지

### 관련 파일

- app/admin/tools/level-sync/page.tsx (Phase 6 UI 수정)

### 검증

- `npx tsc --noEmit` → 오류 없음
- Level Sync Route test → 12/12 통과
- `npm test` → 5 test files, 60 tests 통과
- `.env.local` 부재로 실제 Supabase/admin 로그인 기반 브라우저 smoke test는 미실행

### 비고

- Level Sync Tool v0.1은 코드 범위 완료
- 실제 Supabase/admin 환경 smoke test 완료
- 운영 승인만 남음

---

## 2026-07-14

### 구현

- Level Sync Tool v0.1 smoke test 수행
- 실제 Supabase 환경에서 검증
- 관리자 UI에서 검증
- 검증 경로:
  - `/admin/tools/level-sync`

- 더미 학교:
  - 이름: 스모크테스트더미학교
  - slug:
    - `smoke-test-level-sync-20260714`

- 시나리오 1:
  - 유형: 최초 초기화
  - cumulativeXp: 100
  - before.current_level: null
  - after.current_level: 1
  - level_updated_at: null 유지
  - 결과: 최초 초기화

- 시나리오 2:
  - 유형: 실제 저장 Level 상승
  - cumulativeXp: 141
  - before.current_level: 1
  - after.current_level: 2
  - after.level_updated_at:
    - `2026-07-14T06:26:20.583+00:00`
  - 결과: 실제 저장 Level 상승

- 시나리오 3:
  - 유형: 저장 Level 변경 없음
  - cumulativeXp: 200
  - before.current_level: 2
  - after.current_level: 2
  - before.level_updated_at:
    - `2026-07-14T06:26:20.583+00:00`
  - after.level_updated_at:
    - `2026-07-14T06:26:20.583+00:00`
  - UPDATE는 발생하지 않음
  - 결과: 저장 Level 변경 없음

- 테스트 종료 후 더미 학교 삭제
- 삭제 전 profile_count: 0
- 삭제 후 동일 slug 조회: 0 rows

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 개발 서버 재시작 완료
- `/admin/login` HTTP 200 확인
- 변경한 ADMIN_PASSWORD로 인증 성공
- smoke test 3개 모두 통과
- TypeScript 검증 통과
- Route 테스트 12/12 통과
- 전체 테스트 60/60 통과
- 테스트 데이터 삭제 완료

### 비고

- Level Sync Tool v0.1 기능 검증 완료
- 남은 단계는 운영 승인
- 다른 학교 선택 차단 검증은 선택 사항
- 해당 선택 사항은 완료 판단을 막지 않음

---

## 2026-07-14 (2)

### 구현

- Register Flow → Level 연결 Phase 1 (`docs/decisions/2026-07-14-register-flow-level-connection-phase0.md` Phase 0 결정 문서 기준)
- `app/submit/page.tsx`의 클라이언트 직접 `supabase.from('profiles').insert()` 호출을 제거하고, 공식 서버 Route `POST /api/profiles` 호출로 교체
- Register Flow의 화면, 문구, 입력 순서, 로딩 상태, 성공 UX는 무수정
- `POST /api/profiles`에서 프로필 insert 성공 직후, 해당 학교의 실제 프로필 수(`getSchoolProfileCount`)를 다시 조회해 `cumulativeXp`로 사용하고 기존 `syncSchoolLevel`을 호출 — 등록 1명 = 1 XP 잠정 정책만 사용
- Level Sync 실패(내부 오류 반환 또는 예외 발생)는 서버 로그만 남기고 프로필 등록 성공 응답(201)을 취소하지 않는 non-blocking 방식으로 구현
- 프로필 insert 자체가 실패한 경우(중복/validation/DB 오류)는 Level Sync를 호출하지 않음
- 기존 Zod validation과 Upstash rate limit(20회/60초/IP)은 무수정 재사용
- Route validation과 실제 submit 페이지 필드를 대조해 두 가지 불일치를 보완:
  - `is_self`, `message` 필드가 Zod 스키마에 없어 저장되지 않던 문제를 보완(FROZEN `12-db-schema.md`의 기존 `profiles` 컬럼 목록에 이미 존재하는 필드)
  - `graduation_year` 서버 validation 범위(1990~2035)가 submit 페이지의 실제 졸업년도 드롭다운 범위(1970~2032)와 달라 1970~1989년 졸업자가 서버에서 거부되던 문제를 실제 범위(1970~2032)로 보정
- `types/profile.ts`의 `Profile`/`ProfileInsert`에 누락되어 있던 `is_self`, `message` 필드 보완(DB에는 이미 존재하는 필드, 타입 정의만 실제와 불일치했음)

### 관련 파일

- `app/submit/page.tsx`
- `app/api/profiles/route.ts`
- `app/api/profiles/route.test.ts` (신규, 14 tests)
- `types/profile.ts`
- `docs/decisions/2026-07-14-register-flow-level-connection-phase0.md` (Phase 0 결정 문서, 별도 커밋 전 작성)

### 검증

- `npx vitest run app/api/profiles/route.test.ts` → 14 passed
- `npx tsc --noEmit` → 오류 없음
- `npm test` → 6 test files, 74 tests 통과 (기존 60 + 신규 14)
- `.env.local` 부재로 실제 Supabase/브라우저 기반 smoke test는 미실행

### 비고

- Feed event 생성(`FEED_EVENT_CREATED`)과 XP Source 최종 확정은 이번 범위에 포함하지 않음 — `14-open-issues.md`의 DEFERRED 상태 유지
- `lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`, `lib/api/levels.ts`는 무수정 재사용
- School Hub, Home Feed, `search_logs.clicked_school_id`는 이번 범위 밖
- 배치 등록(여러 명 동시 제출) 시 인당 1회씩 Level Sync가 반복 호출되는 비효율 최적화는 후속 과제로 남김(Phase 0 결정 문서에 이미 기록됨)
- 실제 Supabase 환경에서의 수동 QA(더미 학교로 실제 `/submit` 등록 → `current_level` 변화 확인)는 아직 수행하지 않음

---

## 2026-07-14 (3)

### 구현

- Register Flow → Level Phase 1 실제 smoke test 준비 과정에서 발견된 실제 결함 2건 수정
- **결함 1 — Upstash rate limit 환경변수 누락 시 500**: 로컬 `.env.local`에 `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`이 없을 때 `app/api/profiles/route.ts`의 `ratelimit.limit(ip)`에서 `Failed to parse URL from /pipeline` 예외가 발생해 `POST /api/profiles`가 처리되지 않은 500으로 끝나던 것을 확인
  - `app/api/profiles/route.ts`에 `checkRateLimit(ip)` helper를 분리해 Upstash 설정 여부를 먼저 확인
  - production: 설정 누락을 우회하지 않고 `console.error` 로그 후 명확한 `500 { error: '서버 설정 오류입니다.' }`로 fail-closed (`app/api/admin/auth/route.ts`의 `ADMIN_PASSWORD` 누락 처리와 동일 관례)
  - development/test: `console.warn` 경고만 남기고 rate limit을 건너뛰어 로컬 개발과 smoke test가 막히지 않도록 함
  - Upstash가 정상 설정된 경우(production 포함)의 기존 rate limit 정상/초과 동작은 무수정 유지
  - 실제 환경변수 값은 로그에 남기지 않음(존재 여부만 확인)
  - 저장소 내 다른 rate limit 사용처(`app/api/traces/route.ts`)를 조사했으나 동일한 fallback 관례가 없었음을 확인 — 이번 수정은 `app/api/profiles/route.ts`에만 적용하고 `app/api/traces/route.ts`는 이번 범위에 포함하지 않음(확인된 실제 결함이 아님)
- **결함 2 — 전체 실패 시 "완료" 문구 오표시**: `app/submit/page.tsx`에서 프로필 등록이 전부 실패(성공 0명 + 실패 1명 이상)해도 결과 화면 제목이 `연결 완료!`/`등록 완료!`로 표시되던 것을 확인
  - `app/submit/resultText.ts`(신규, `app/admin/tools/level-sync/validation.ts`와 동일한 "페이지 옆 순수 함수 모듈" 관례를 따름)에 `isAllFailed`, `resultHeading` 순수 함수 분리
  - 성공 0명 + 실패 1명 이상일 때만 제목을 `등록하지 못했어요`/`연결하지 못했어요`로 변경, 그 외(전체 성공/부분 성공/중복만 있는 경우)는 기존 `완료!` 문구 그대로 유지
  - 전체 실패 시 본문의 "N명 등록/연결됐어요" 줄만 숨기고, 기존 중복/실패 안내 줄과 레이아웃·재시도 버튼(`계속 등록하기`)은 무수정

### 관련 파일

- `app/api/profiles/route.ts` (rate limit fallback 추가)
- `app/api/profiles/route.test.ts` (신규 rate limit fallback 테스트 3개 추가, 기존 테스트는 Upstash 설정 상태를 명시적으로 stub하도록 보완)
- `app/submit/page.tsx` (전체 실패 시 문구 수정)
- `app/submit/resultText.ts` (신규)
- `app/submit/resultText.test.ts` (신규)

### 검증

- `npx vitest run app/api/profiles/route.test.ts app/submit/resultText.test.ts` → 23 passed
- `npx tsc --noEmit` → 오류 없음
- `npm test` → 7 test files, 83 tests 통과 (기존 74 + 신규 9)
- `.env.local` 부재로 실제 Supabase/브라우저 기반 재현 smoke test(수정 후)는 미실행

### 비고

- DB 변경, FROZEN 문서 변경, Level Policy/Persistence 수정, Feed event는 이번 범위에 포함하지 않음
- `app/api/traces/route.ts`에도 동일한 Upstash 설정 누락 패턴이 존재하나 이번에 확인된 실제 결함 범위가 아니므로 수정하지 않음 — 후속 검토 대상으로 남김
- 수정 후 실제 로컬 `.env.local` 없는 상태에서의 브라우저 재현 smoke test는 아직 수행하지 않음

---

## 2026-07-14 (4)

### 구현

- 결함 1(Upstash rate limit 환경변수 누락 시 500)과 결함 2(전체 실패 시 `연결 완료!` 오표시) 수정에 대한 수동 브라우저 smoke test 수행(운영자 보고 기준)
- 검증 경로:
  - `localhost:3001` (`npm run dev`)
- 시나리오 1 — 정상 등록:
  - `/submit` 화면과 CSS 정상 렌더링 확인
  - `POST /api/profiles` → 201 응답
  - Upstash 환경변수가 없는 development 환경에서 rate limit 우회 warning 출력, 요청은 정상 처리됨(결함 1 수정 확인)
  - 결과 화면: `연결 완료!` + `1명 연결됐어요` 정상 표시
- 시나리오 2 — 전체 실패(브라우저 Network를 Offline으로 설정해 재현):
  - 성공 0명 · 실패 1명 상태 재현
  - 결과 화면: `연결하지 못했어요` + `1명은 등록에 실패했어요` 표시(결함 2 수정 확인)
  - 기존의 잘못된 `연결 완료!` 및 성공 인원 문장은 표시되지 않음
  - 테스트 후 Network 설정을 No throttling으로 복구

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 수동 브라우저 smoke test 시나리오 2개 모두 통과(운영자 보고 기준)
- rate limit fallback(development 우회) 실제 동작 확인
- 전체 실패 결과 화면 문구 실제 동작 확인

### 비고

- Register Flow → Level Phase 1 및 rate limit/전체 실패 화면 수정의 수동 smoke test 완료
- 이번 smoke test는 `POST /api/profiles` 응답과 화면 문구만 확인했으며, `schools.current_level`/`level_updated_at`이 실제로 갱신됐는지는 이번 시나리오에 포함되지 않음 — DB 레벨 확인은 이전 턴에서 준비한 더미 학교 SQL을 사용한 별도 확인이 필요
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-15

### 구현

- Register Flow → Level 연결 Phase 2 — 데이터 정합성·중복 처리·실패 처리 검증
- 기준 커밋 `c077c31`(Phase 1 완료 상태) 기준으로 `app/api/profiles/route.ts`, `lib/api/levels.ts`, `types/profile.ts`, 기존 테스트를 코드 레벨로 재분석한 결과, 코드 로직 자체의 결함은 발견되지 않음(상세는 아래 "확인된 사실" 참고)
- 다만 (a) 여러 명을 한 번에 등록할 때 학교당 신규 성공 건수만큼 `syncSchoolLevel`이 반복 호출되는 동작과 (b) 성공/중복/실패 배치 분류 로직이 `app/submit/page.tsx`의 `handleSubmit` 클로저 내부에 인라인되어 있어 자동 테스트가 불가능했던 두 가지 실제 확인 공백을 발견
- `app/submit/page.tsx`의 등록 루프(사람별 `POST /api/profiles` 순차 호출 + 성공/중복/실패 집계)를 `app/submit/registerPeople.ts`로 분리 — 동작은 100% 동일(로직 이동만), fetch 호출 순서/횟수/바디, 카운트 규칙 무변경
- `normalizeInsta`도 함께 이동(등록 루프와 강하게 결합된 순수 함수)
- 분리로 확보된 테스트 가능성을 이용해 배치 시나리오(신규 1명/중복만/신규+중복 혼합/여러 신규/실패/재시도) 테스트 8개를 `app/submit/registerPeople.test.ts`에 신규 작성
- `app/api/profiles/route.test.ts`에 배치·재시도 관점 테스트 2개 추가(같은 학교 신규 성공 2건 연속 시 `syncSchoolLevel`이 정확히 2번, 각기 다른 cumulativeXp로 호출되는지 / 성공 후 동일 등록 재시도 시 `syncSchoolLevel`이 최초 1회만 호출되는지)
- 코드 변경 없음: `app/api/profiles/route.ts`, `lib/api/levels.ts`, `lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`, `types/profile.ts` — 분석 결과 기존 로직이 이미 정책을 만족해 수정 불필요로 판단

### 확인된 사실

- 신규 프로필 등록 성공 시: `app/api/profiles/route.ts`의 `profiles` insert 성공 직후(에러 없음)에만 `syncSchoolLevel` 호출. 중복(23505→409)과 그 외 실패(400/429/500)는 Level Sync 도달 전에 응답이 반환되어 호출되지 않음(회귀 테스트로 재확인)
- 여러 명 등록 시: 사람 1명 = `POST /api/profiles` 1회 = (성공 시) `syncSchoolLevel` 1회. N명 신규 성공이면 동일 학교에 대해 `syncSchoolLevel`이 N번 순차 호출됨(비효율이지만 데이터 정합성 문제는 아님 — 아래 "남은 blocker" 참고)
- Level Sync 실패 시: `try/catch`로 감싸져 있어 API 응답은 항상 `201 { data }` 유지(새 필드 추가 없음), 화면은 `res.ok` 여부만으로 success를 집계하므로 Level Sync 실패는 사용자에게 노출되지 않음(Phase 0 결정 문서의 채택된 권장안과 일치, 회귀 없음 확인)
- 재시도 시 XP/Level 중복 반영 가능성: 없음. `cumulativeXp`가 `getSchoolProfileCount`(실제 DB row count)로 매번 새로 계산되는 파생값이라 "누적 합산"이 아니며, `resolveLevelUpdate`의 저장 판단이 저장된 Level 이상으로만 갱신되는 단조 증가 정책이라 동일 값으로 재호출해도 재저장이 일어나지 않음(`lib/api/levels.test.ts` 기존 테스트 1·2로 이미 검증됨). 또한 `profiles` 테이블의 기존 unique index(`uq_profiles_identity`)가 동일 학교/졸업년도/학년/반/이름 조합의 재삽입을 DB 레벨에서 차단해, 재시도가 성공 응답을 두 번 받는 경우 자체가 발생하지 않음
- 부분 성공 시 success/dup/fail 카운트: `registerPeople`가 매 요청의 실제 HTTP 상태(201/409/그외)만으로 집계하므로 항상 실제 DB 결과와 일치하며, `success + dup + fail`이 시도 인원수와 항상 같음(신규 테스트로 검증)

### 관련 파일

- `app/submit/registerPeople.ts` (신규)
- `app/submit/registerPeople.test.ts` (신규, 8 tests)
- `app/submit/page.tsx` (등록 루프를 `registerPeople` 호출로 교체 — 동작 무변경)
- `app/api/profiles/route.test.ts` (배치/재시도 테스트 2개 추가)
- `docs/IMPLEMENTATION_LOG.md`

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run app/api/profiles/route.test.ts app/submit/registerPeople.test.ts app/submit/resultText.test.ts` → 35 passed
- `npm test` → 8 test files, 95 tests 통과 (기존 83 + 신규 12)
- `git diff --check` → 공백 오류 없음

### 비고

- 남은 blocker(정책 미확정, 임의 구현하지 않음): 여러 명 일괄 등록 시 학교당 `syncSchoolLevel`이 인당 1회씩 반복 호출되는 비효율은 Phase 0 결정 문서(`Concurrency considerations`)에서 이미 식별된 사항으로, 이번 Phase 2에서도 재확인만 하고 해결하지 않음. 해결하려면 `POST /api/profiles`를 배치 API로 바꾸거나(FROZEN `13-api.md` §10 "신규 P1 데이터 모델/배치 API 임의 추가 금지"와 상충 가능, 별도 결정 필요) 요청 간 상태를 공유하는 새 인프라가 필요해 이번 Phase 2의 "기존 정책 안에서 최소 구현" 범위를 벗어난다고 판단
- FROZEN `07-register-flow.md` §5의 "동명이인 허용 + 확인 후 등록 계속" 흐름은 현재 코드에 없고(DB unique index가 동일 이름을 즉시 차단), 이는 Phase 1 이전부터 존재하던 기존 Register Flow의 완성도 공백이며 Level Sync 연결과는 무관 — 이번 Phase 2 범위 밖으로 남김
- `app/api/traces/route.ts`, admin Level Sync 도구, 다른 rate limit 사용처는 무수정
- DB migration/schema 변경 없음
- Feed event, XP Source 최종 확정은 이번 범위에 포함하지 않음
- collector/BoostKitchen 관련 내용 없음
- 새로운 정책 결정이 없어 `docs/decisions/`에 신규 문서를 추가하지 않음

---

## 2026-07-15 (2)

### 구현

- Register Flow → Level Phase 2(배치 등록 정합성/중복 처리 검증, `registerPeople` 분리)에 대한 수동 브라우저 smoke test 수행(운영자 보고 기준)
- 시나리오 — 같은 학교에 친구 3명 동시 제출(신규 2명 + 기존 인물과 동일한 중복 1명):
  - 결과 화면: `2명 등록됐어요` 정확히 표시(신규 성공 카운트 일치)
  - 결과 화면: `1명은 이미 등록되어 있었어요` 정확히 표시(중복 카운트 일치)
  - 학교 전체 인원: 기존 1명 + 신규 성공 2명만 반영되어 `3명이 함께 있어요` 표시 — 중복 1명은 전체 인원에 추가 반영되지 않음
  - 실패 문구·500 오류 없음
  - `registerPeople` 모듈 분리 이후에도 기존 등록 UI와 부분 중복 집계 정상 동작 확인

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 수동 브라우저 smoke test 1개 시나리오 통과(운영자 보고 기준)
- 신규 2명/중복 1명 배치 등록의 성공·중복 카운트, 학교 전체 인원 반영이 모두 실제 화면에서 기대값과 일치함을 확인

### 비고

- Register Flow → Level Phase 2의 배치(신규+중복 혼합) 등록 시나리오 수동 smoke test 완료
- 이번 smoke test는 화면 카운트와 학교 전체 인원 표시만 확인했으며, `schools.current_level`/`level_updated_at`이 신규 성공 2건 기준으로 정확히 갱신됐는지는 DB 레벨로 별도 확인되지 않음(이전 턴에서 준비한 더미 학교 SQL로 별도 확인 필요)
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-15 (3)

### 구현

- Register Flow → Level 연결 Phase 3 — 학교 실제 profile count, 저장된 Level 상태, 학교 페이지 표시 간 정합성 분석
- 기준 커밋 `934c26e` 기준으로 `app/school/[slug]/page.tsx`, `app/school/[slug]/[year]/page.tsx`, `app/school/[slug]/[year]/[class]/page.tsx`, `lib/api/schools.ts`, `lib/api/profiles.ts`, `lib/api/levels.ts`, `types/school.ts`, `next.config.ts`, `app/admin/tools/level-sync/page.tsx`(읽기 전용 확인, 무수정)를 코드 레벨로 분석
- **핵심 발견 — 코드 결함 없음**: School/Year/Class 페이지 어디에도 `current_level`/`level_updated_at`을 표시하는 코드가 없음(`current_level`/`level_updated_at`을 참조하는 곳은 `lib/api/levels.ts`, `lib/policy/levelPersistence.ts`, admin Level Sync 도구뿐). 즉 이번 Phase 3이 검증 대상으로 삼은 시나리오 f/g/h(Level null 처리, 저장값 vs 계산값 우선순위, Level Sync 성공 후 화면이 최신 저장값을 읽는지)는 **공개 학교 페이지에는 적용 대상 자체가 없음** — Level 표시는 Phase 0 결정 문서에서 이미 "School Hub 화면 변경"으로 범위 밖 처리된 항목이며, 구현 원칙 2("정책에 명확히 없으면 임의로 UI를 추가하지 않는다")에 따라 이번에도 추가하지 않음
- profile count(화면에 유일하게 표시되는 정합성 대상)는 School/Year/Class 세 페이지 모두 `lib/api/profiles.ts`의 count 함수(`getProfilesBySchool`/`getYearProfileCount`/`getClassProfileCount`/`getSchoolProfileCount`)를 통해 매 요청마다 `is_hidden=false` 기준으로 DB에서 새로 계산되며, 이는 Level Sync의 `cumulativeXp` 소스(`getSchoolProfileCount`)와 완전히 동일한 정의를 공유함 — 화면 인원 수와 Level 계산의 count 정의가 서로 다를 경로 없음
- 캐시/정적 렌더링으로 인한 staleness 위험 재확인: School 페이지는 `headers()` 사용으로, School/Year/Class 페이지 모두 `searchParams` 사용으로 Next.js가 자동으로 동적 렌더링을 강제함(둘 다 Next.js App Router에서 정적 캐싱을 무효화하는 API). 추가로 이 저장소의 Next.js 버전(`^15.3.8`)은 fetch 요청이 기본적으로 캐시되지 않는 버전이라 서버 측 캐싱으로 인한 stale 데이터 경로는 발견되지 않음. 다만 클라이언트 라우터 캐시(Link를 통한 소프트 내비게이션)는 정적 코드 분석만으로 100% 확증할 수 없어 "수동 smoke test 필요 여부"에 별도로 남김
- admin Level Sync 도구(무수정, 읽기 전용 확인만)는 이미 `current_level: null`을 "미초기화 (null)"로 명시 표시하고, 저장값을 우선 표시하며 계산값이 더 낮을 때 "하락 없음"을 명시하는 등 구현 원칙 7·8을 이미 만족하고 있음을 확인
- 코드 변경 없음(결함 미발견) — `lib/api/profiles.ts`(테스트 신규 추가는 있으나 함수 로직 무수정 회귀 테스트만 작성)를 포함해 이번 Phase 3에서 실제 소스 코드는 수정하지 않음
- `lib/api/profiles.ts`의 count 함수들(School Hub/Year/Class 화면과 Level Sync가 공유하는 유일한 profile count 소스)에 대한 테스트가 전무했던 공백을 발견해 `lib/api/profiles.test.ts` 신규 작성 — 쿼리 필터(`school_id`/`graduation_year`/`grade`/`class_number`/`is_hidden=false`)가 의도한 그대로인지, 오류·null 시 0/빈 배열로 안전하게 처리되는지 회귀 고정

### 관련 파일

- `lib/api/profiles.test.ts` (신규, 8 tests)
- `docs/IMPLEMENTATION_LOG.md`

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/api/profiles.test.ts` → 8 passed
- `npm test` → 9 test files, 103 tests 통과 (기존 95 + 신규 8)
- `git diff --check` → 공백 오류 없음

### 비고

- 결함 없음 — School/Year/Class 페이지의 profile count 표시는 이미 항상 최신 DB 값을 정확한 필터로 읽고 있으며, Level Sync와 동일한 count 정의를 공유함
- Level 표시(f/g/h 시나리오)는 공개 페이지에 아직 노출되지 않아 검증 대상이 없음 — School Hub에 Level을 실제로 노출하려면 별도의 School Hub 화면 변경 결정이 선행되어야 하며, 이는 Phase 0에서 이미 범위 밖으로 명시된 항목이라 이번 Phase 3에서 임의로 추가하지 않음(blocker로 보고, 새 정책 결정 없이는 구현하지 않음)
- admin Level Sync 도구는 읽기 전용으로만 확인했고 무수정
- DB migration/schema 변경 없음, FROZEN 문서 무수정
- collector/BoostKitchen 관련 내용 없음
- 코드 결함이 없어 `docs/decisions/`에 신규 문서를 추가하지 않음

---

## 2026-07-15 (4)

### 구현

- Register Flow → Level Phase 3(학교 페이지 profile count 정합성 분석)에 대한 수동 브라우저 smoke test 수행(운영자 보고 기준)
- 시나리오 — 학교 페이지 → 등록하기 링크 이동 → 신규 1명 등록 → 성공 화면의 `우리 학교 페이지에서 확인하기` 링크(소프트 내비게이션)로 복귀:
  - 브라우저 새로고침 없이 등록 인원이 기존 3명 → 4명으로 즉시 반영됨
  - 학교 카드에 `4명 등록` 표시
  - 안내 영역에 `이미 4명이 모였어요` 표시
  - 프로필 목록에도 실제 4개 항목 표시
  - 클라이언트 라우터 캐시로 인한 오래된 count 표시는 발생하지 않음 — Phase 3 분석에서 남겼던 유일한 미확증 항목(Client Router Cache staleness)이 실제로 문제없음을 확인

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 수동 브라우저 smoke test 1개 시나리오 통과(운영자 보고 기준)
- 신규 등록 후 소프트 내비게이션으로 학교 페이지 복귀 시 최신 profile count가 즉시 반영됨을 확인

### 비고

- Register Flow → Level Phase 3의 남은 blocker 중 "클라이언트 라우터 캐시로 인한 stale count 가능성"이 이번 smoke test로 해소됨
- Level 표시(f/g/h 시나리오) 관련 blocker(School Hub 화면 변경 미착수)는 여전히 유효 — 이번 smoke test 범위 밖
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-15 (5)

### 구현

- Admin Level Sync 도구 완성 및 자동 검증
- 기준 커밋 `da20678` 기준으로 `app/admin/tools/level-sync/page.tsx`, `validation.ts`, `validation.test.ts`, `app/api/admin/tools/level-sync/route.ts`, `route.test.ts`, `lib/api/levels.ts`, `levels.test.ts`, `lib/admin-auth.ts`를 재분석한 결과, **학교 검색·ID 조회·Level 스냅샷 조회·cumulativeXp 입력/검증·계산 미리보기·실행 버튼(`POST /api/admin/tools/level-sync` 연결)·실행 중 중복 클릭 방지·학교 변경 시 이전 결과 초기화·성공 후 최신 저장값 재조회가 이미 모두 구현되어 있었음**을 확인 — 코드 자체는 이미 완성 상태였고 새로 구현할 기능은 없었음
- 확인된 미완성/결함 2건(둘 다 최소 범위로 수정):
  1. **안내 문구가 실제 구현 상태와 불일치**: 페이지 상단 문구가 "현재는 조회만 가능하며, 동기화 실행 기능은 다음 단계에서 추가됩니다"라고 표시하고 있었으나, 바로 아래 코드는 이미 `handleSync`가 `POST /api/admin/tools/level-sync`를 실제로 호출하도록 완전히 연결되어 있어 문구가 관리자에게 사실과 다른 정보를 주고 있었음 — 실제 구현 상태(조회 + 동기화 실행 가능)를 반영하도록 문구만 수정. 기존 스타일/레이아웃 무변경
  2. **실행 결과 문구 판단 로직이 컴포넌트 내부에 인라인되어 테스트 불가능**: `resultLabel`(최초 초기화/실제 상승/변경 없음 3분류) 계산이 `page.tsx` 클로저 안에 있어 자동 테스트가 없었음 — 동작 무변경으로 `app/admin/tools/level-sync/validation.ts`에 `describeSyncResult(before, after)` 순수 함수로 추출하고 `page.tsx`는 이를 호출만 하도록 변경
- `lib/api/schools.ts`(admin 도구가 사용하는 `searchSchools`/`getSchoolById`)에 대한 테스트가 전무했던 공백을 발견해 `lib/api/schools.test.ts` 신규 작성(시나리오 a/b/c: 검색 성공, ID 조회 성공, 존재하지 않는 학교)
- 나머지 요구 시나리오(d~q)는 기존 `validation.test.ts`(cumulativeXp validation), `route.test.ts`(401/400/500 각 분기, 성공/unchanged, mock 호출 인자), `levels.test.ts`(downgrade 방지, null 초기화)로 이미 충분히 커버되어 있음을 확인하고 중복 테스트를 추가하지 않음
- 코드 로직 변경 없음(순수 추출 + 문구 정정만) — `lib/policy/levelPolicy.ts`, `lib/policy/levelPersistence.ts`, `lib/api/levels.ts`, `app/api/admin/tools/level-sync/route.ts`, `lib/admin-auth.ts`는 무수정

### 확인된 사실

- 인증: `requireAdmin`이 쿠키 부재/유효하지 않은 세션 모두 동일하게 401만 반환(403 경로 없음) — `app/api/admin/auth/route.ts`와 동일한 기존 관례이며 결함 아님
- "학교 없음"(404): FROZEN 결정 문서(`2026-07-10-level-sync-no-404.md`)에 따라 이 라우트는 404를 절대 반환하지 않고 원인 불명 실패를 500 `Snapshot failed`로 통일 — 이번에도 이 정책을 그대로 유지, 변경하지 않음
- Level 감소 방지: `resolveLevelUpdate`가 저장된 Level 이상일 때만 갱신하므로 계산 Level이 더 낮아도 저장값은 항상 유지됨(`lib/api/levels.test.ts` 기존 테스트로 이미 검증됨, 이번에 재확인만 함)
- 성공 후 재조회: `handleSync` 성공 시 `loadLevelSnapshot(schoolId)`을 다시 호출해 anon client로 최신 `current_level`/`level_updated_at`을 재조회함(route 응답을 재계산하지 않음) — 이미 구현되어 있었음, 무수정
- 중복 클릭 방지: `executing` 상태로 버튼 disabled + `handleSync`/`selectSchool`/`handleIdLookup` 모두 진입 시 `executing` 체크로 조기 반환 — 이미 구현되어 있었음, 무수정
- 학교 변경 시 초기화: `selectSchool`이 `xpInput`/`execResult`/`execError`를 매번 초기화 — 이미 구현되어 있었음, 무수정

### 관련 파일

- `app/admin/tools/level-sync/page.tsx` (안내 문구 수정, `resultLabel` 로직을 `describeSyncResult` 호출로 교체 — 동작 무변경)
- `app/admin/tools/level-sync/validation.ts` (`describeSyncResult`, `LevelSnapshot` 타입 추가)
- `app/admin/tools/level-sync/validation.test.ts` (`describeSyncResult` 테스트 5개 추가)
- `lib/api/schools.test.ts` (신규, 5 tests)
- `docs/IMPLEMENTATION_LOG.md`

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run app/admin/tools/level-sync/validation.test.ts app/api/admin/tools/level-sync/route.test.ts lib/api/schools.test.ts lib/api/levels.test.ts` → 50 passed
- `npm test` → 10 test files, 113 tests 통과 (기존 103 + 신규 10)
- `git diff --check` → 공백 오류 없음

### 비고

- 결함은 문구 불일치 1건뿐이었고, 그 외에는 이미 운영 가능한 완성 상태였음을 확인
- Register Flow, 공개 School Hub UI, DB schema/migration/RPC/RLS는 이번에도 무수정
- collector/BoostKitchen 관련 내용 없음
- 새로운 정책 결정이 없어 `docs/decisions/`에 신규 문서를 추가하지 않음

---

## 2026-07-15 (6)

### 구현

- Admin Level Sync 도구 완성 작업(문구 수정, `describeSyncResult` 추출)에 대한 수동 브라우저 smoke test 수행(운영자 보고 기준)
- 시나리오 — 관리자 로그인 → `/admin/tools/level-sync` 접근 → 학교 검색·선택 → cumulativeXp 입력/실행 반복:
  - 안내 문구가 실제 동기화 실행 기능에 맞게 표시됨(더 이상 "다음 단계에서 추가됩니다" 아님) 확인
  - 선택 학교의 School ID, `current_level`, `level_updated_at` 정상 표시 확인
  - cumulativeXp `0` 입력 → 계산 Level Lv.1, 저장 Level 1 → `저장 Level 변경 없음` 표시
  - cumulativeXp `141` 입력·실행 → Level 1 → 2로 실제 저장 상승, `실제 저장 Level 상승` 표시
  - 상승 후 `current_level`이 2로 재조회되고 `level_updated_at`이 새 시간으로 저장됨 확인(성공 후 최신 저장값 재조회 동작 확인)
  - 동일 cumulativeXp `141` 재실행 → Level 2 유지, `level_updated_at` 불변 → `저장 Level 변경 없음` 표시(재시도 시 중복 반영 없음 확인)
  - Level 2 상태에서 cumulativeXp `0` 입력·실행 → 계산 Level은 Lv.1이지만 저장 Level 2 유지(다운그레이드 차단), `저장 Level 변경 없음` 표시
  - 다른 학교 선택 시 이전 XP 입력값·계산 미리보기·실행 결과·오류 메시지 모두 초기화 확인, 새 학교의 `current_level`/`level_updated_at`만 새로 표시됨 확인

### 관련 파일

- `docs/IMPLEMENTATION_LOG.md`
- 기능 소스 변경 없음
- 테스트 코드 변경 없음

### 검증

- 수동 브라우저 smoke test 1개 시나리오(문구 확인 + 상승 + unchanged + downgrade 차단 + 학교 변경 초기화) 통과(운영자 보고 기준)
- `describeSyncResult` 추출 및 안내 문구 수정 이후에도 기존 동작이 화면에서 그대로 재현됨을 확인(회귀 없음)

### 비고

- Admin Level Sync 도구 완성 작업의 수동 smoke test 완료 — 남은 blocker 없음
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-15 (7)

### 구현

- School Growth Foundation Phase 1A — School Hub/Home Growth Feed가 공통으로 쓸 성장 정책·데이터 계약·순수 계산 로직 확정
- **미커밋 Home v1.1 정리**: 승인되지 않았던 검색 랜딩 중심 Home 구현을 기준 커밋(`7f335f7`) 상태로 되돌림
  - `app/page.tsx`를 기준 커밋 내용으로 완전히 복원(`git checkout`이 이 환경 권한상 차단되어 기준 커밋에서 읽었던 원본 내용을 그대로 재작성하는 방식으로 복원, 이후 `git diff`로 기준 커밋과 완전히 동일함을 확인)
  - `docs/IMPLEMENTATION_LOG.md`에 남아 있던 미커밋 Home v1.1 관련 두 항목(구현 기록 + 시각 보완/build 기록)만 정확히 제거하고, 그 이전에 이미 존재하던 기록은 전혀 수정하지 않음
  - `docs/design-package-v1.1/01-home-final-design.md`, `docs/decisions/2026-07-15-home-final-design-v1.md`는 새 제품 방향과 충돌해 SUPERSEDED로 표시(이 환경에서 `rm`이 차단되어 실제 삭제는 사용자가 직접 수행해야 함 — 각 파일에 정확한 삭제 명령 기재)
  - `components/TabBar.tsx`의 홈(`/`)/학교 찾기(`/search`) 2축 구조는 유지(FROZEN `04-home-feed.md` §6과 일치하는 기존 확정 사항). `/submit`, `/invite` 라우트 파일과 관리자 페이지 숨김 로직(`pathname.startsWith('/admin')`)은 그대로 존재함을 재확인
- `docs/decisions/2026-07-15-school-growth-foundation.md`(신규) 작성 — Home 성장 피드 방향, School Hub 우선 구현 순서, 주간/오늘 랭킹 기준, 실제 데이터만 사용, 순위 변화 표시 유보, Home v1.1 미채택을 정책 근거로 기록
- **School Growth Snapshot** 구현(신규, 순수 계산):
  - `types/schoolGrowth.ts` — `SchoolGrowthSnapshot`/`SchoolGrowthSnapshotInput`/`SchoolState`('A'|'B'|'C'만, D는 제외) 계약 정의
  - `lib/policy/schoolGrowth.ts` — `calculateSchoolGrowthSnapshot()`(순수 함수, `calculateLevelState` 재사용, DB 접근·`syncSchoolLevel` 호출 없음), `classifySchoolState()`(A/B/C 경계, `03-level-policy.md` §5 그대로)
  - `effectiveLevel`은 `storedCurrentLevel`이 `calculatedLevel`보다 높을 때만 저장값을 사용(Level 하락 금지, §8 저장값 우선 원칙 그대로 적용)
  - `isNearLevelUp`은 `remainingToNext <= 2`(§7 확정값) 그대로 사용 — 임의 기준 없음
  - `remainingToNext`는 실제 curve 계산값을 그대로 반환하며, State A의 "다음 레벨까지 1명" UI 카피(§7)로 대체하지 않음(대체는 화면 레이어의 책임이라고 코드에 명시)
  - `lib/api/schools.ts`에 `getSchoolGrowthSnapshot(schoolId)` I/O 래퍼 추가 — 기존 `getSchoolProfileCount`(visible profile count) 재사용, 신규 count 로직 없음, DB 수정 없음
- **Ranking 데이터 계약** 구현(신규, 순수 계산만):
  - `types/ranking.ts` — `GrowthRankingInput`/`GrowthRankingRow` 계약 정의
  - `lib/policy/schoolRanking.ts` — `sortGrowthRanking()`/`topGrowthRanking()`(순수 함수, 신규 공개 프로필 수 내림차순 → 최근 등록 시각 내림차순 → 학교명 오름차순, 가짜 학교로 빈 자리를 채우지 않음)
  - 실제 DB 집계(주간/오늘 신규 등록 수를 학교별로 효율적으로 구하는 쿼리)는 이번 Phase에서 구현하지 않음 — 아래 "비고"의 blocker 참고

### 확인된 사실 / blocker

- **School State D(대표학교) 미구현**: `03-level-policy.md` §6의 완성도(Completion) 계산식이 FROZEN 문서에 없어(“세부 집계 구현은 Policy 계층이 소유한다”고만 되어 있고 실제 공식·집계 대상이 없음) State D 판정과 완성도 %를 구현하지 않음. `SchoolState` 타입도 `'A'|'B'|'C'`로만 정의함. **완성도 계산식이 결정되기 전까지는 진행 불가.**
- **주간/오늘 성장 랭킹 DB 집계 미구현**: 저장소 전체에서 `.rpc()` 호출은 `search_schools_v2`(학교 이름 검색) 하나뿐이며, 학교별 신규 등록 수를 기간별로 집계하는 기존 RPC/view가 없음을 확인. 전체 `profiles`를 무제한으로 내려받아 JS 집계하거나 학교별 N+1 count 반복 호출은 금지 조건에 해당해 시도하지 않음. 아래 "6. 주간·오늘 성장 랭킹의 데이터 접근 분석"에 RPC 설계안(입력/출력/인덱스/RLS)까지 정리해 별도 승인 후 진행 대상으로 남김.
- `effectiveLevel > calculatedLevel`인 드문 경우(신고로 프로필이 숨김 처리되어 현재 인원이 과거보다 줄어든 경우)에 `nextLevel`/`remainingToNext`/`progressPercent`는 항상 `calculatedLevel` 기준으로 계산되며 `effectiveLevel` 기준으로 재계산하지 않는다 — Level 공식(`threshold()`)이 `lib/policy/levelPolicy.ts` 밖으로 노출되어 있지 않아 임의로 재구현하지 않기 위한 설계 선택이며, 코드 주석에 명시함(School Hub Phase 1B 화면 설계 시 참고 필요).

### 관련 파일

- `app/page.tsx` (기준 커밋 상태로 복원)
- `components/TabBar.tsx` (2축 구조 유지 확인, 변경 없음)
- `docs/design-package-v1.1/01-home-final-design.md` (SUPERSEDED로 표시)
- `docs/decisions/2026-07-15-home-final-design-v1.md` (SUPERSEDED로 표시)
- `docs/decisions/2026-07-15-school-growth-foundation.md` (신규)
- `types/schoolGrowth.ts` (신규)
- `types/ranking.ts` (신규)
- `lib/policy/schoolGrowth.ts` (신규)
- `lib/policy/schoolGrowth.test.ts` (신규, 18 tests)
- `lib/policy/schoolRanking.ts` (신규)
- `lib/policy/schoolRanking.test.ts` (신규, 7 tests)
- `lib/api/schools.ts` (`getSchoolGrowthSnapshot` 추가)
- `lib/api/schools.test.ts` (신규 테스트 3개 추가)
- `docs/IMPLEMENTATION_LOG.md`

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/schoolGrowth.test.ts lib/policy/schoolRanking.test.ts lib/api/schools.test.ts` → 31 passed
- `npm test` → 12 test files, 139 tests 통과 (기존 113 + 신규 26)
- `npm run build` → 이 세션의 도구 권한 설정으로 실행이 차단되어 수행하지 못함(우회 시도 안 함)
- `git diff --check` → 공백 오류 없음

### 비고

- Home Growth Feed UI, School Hub UI, DB migration, RPC 생성, 실제 랭킹 배너, Register Flow, Admin 도구는 이번 Phase 1A에서 구현하지 않음(지시된 금지 범위)
- 남은 blocker 2건(State D 완성도 계산식, 주간/오늘 랭킹 DB 집계 설계 승인)은 Phase 1B 착수 전 확정 필요
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-15 (8)

### 구현

- School Growth Foundation Phase 1B — 최근 7일 학교 성장 순위와 오늘 가장 빠르게 성장한 학교 집계 기반 구현(RPC 설계 + 순수 계산 보완, Home/School Hub UI 연결은 이번 범위 아님)
- 작업 전 working tree가 기준 커밋(`1271656`)과 완전히 일치함을 확인 후 시작
- **Level Policy threshold export**(`lib/policy/levelPolicy.ts`): 기존 module-scope `threshold()`에 `export`만 추가, 공식·기존 동작 무변경(`levelPolicy.test.ts` 11/11 회귀 없음 확인)
- **School Growth Snapshot 보완**(`lib/policy/schoolGrowth.ts`, Phase 1A blocker 해소): `effectiveLevel`이 `calculatedLevel`보다 높은 드문 경우(신고로 프로필이 숨겨져 현재 인원이 줄어든 경우)에도 `nextLevel`/`nextLevelThreshold`/`remainingToNext`/`progressPercent`를 `effectiveLevel` 기준으로 재계산 — 새로 export한 `threshold()`를 재사용하고 공식은 복제하지 않음. 일반적인 경우(`effectiveLevel === calculatedLevel`)는 기존과 동일하게 `calculateLevelState` 결과를 그대로 사용
- **시간 계산 순수 함수**(신규, `lib/policy/growthPeriod.ts`): `getRecentWeekStart(now)`(now-7일), `getSeoulTodayStartUtc(now)`(Asia/Seoul 00:00을 UTC로, KST가 DST 없는 UTC+9 고정이라는 사실을 이용해 시스템 로컬 타임존에 의존하지 않고 UTC getter만으로 계산)
- **DB 집계 RPC**(신규, `supabase/migrations/20260715120000_school_growth_ranking_rpc.sql`): `school_growth_ranking_v1(p_since, p_until, p_limit)` — 기간 내 `is_hidden=false` 신규 프로필을 학교별로 집계해 신규 수 내림차순 → 최근 등록 시각 내림차순 → 학교명 오름차순 → school_id 오름차순으로 정렬 후 반환. `SECURITY INVOKER`, `anon`/`authenticated`에 `EXECUTE` 부여·`PUBLIC` revoke. 개인정보성 필드(nickname/instagram_id/message) 미반환. 부분 인덱스 `idx_profiles_visible_created_school (created_at DESC, school_id) WHERE is_hidden = false` 함께 추가. **사용자가 Supabase SQL Editor에서 직접 적용 완료(2026-07-15) — 아래 "Supabase 적용 및 스모크 테스트 결과" 참고**
- **TypeScript RPC 래퍼**(신규, `lib/api/schools.ts`): `getWeeklySchoolGrowthRanking(now)`(최근 7일 TOP 5), `getTodayFastestGrowingSchool(now)`(오늘 TOP 1, 없으면 null) — 둘 다 같은 RPC를 `p_since`/`p_limit`만 다르게 호출. bigint/count 문자열을 안전한 정수로 검증·변환, 잘못된 행은 로그 남기고 건너뜀(조용히 왜곡하지 않음), RPC 오류 시 예외 없이 빈 배열/null 반환. `lib/policy/schoolRanking.ts::topGrowthRanking()`을 재사용해 `rank` 부여. **Home/School Hub UI에는 연결하지 않음**
- `docs/decisions/2026-07-15-school-growth-ranking-rpc.md`(신규) 작성 — RPC를 하나로 통합한 이유, SECURITY INVOKER 선택 근거, 권한 설정, `visible_profile_count` 추가 이유, 인덱스 설계 근거를 기록

### 확인된 사실

- `supabase/migrations/` 디렉터리가 이번까지 저장소에 전혀 없었음(기존 RPC `search_schools_v2`도 migration 파일 없이 Supabase에서 직접 생성된 것으로 추정) — 이번에 표준 Supabase CLI 명명 규칙(`YYYYMMDDHHMMSS_설명.sql`)으로 새로 만듦
- `supabase-schema.sql`은 이미 알려진 대로 실제 운영 DB 대비 stale함(current_level/level_updated_at/search_logs 등 누락) — canonical mirror로 활발히 유지되고 있지 않다고 판단해 이번 RPC/인덱스 추가분을 반영하지 않음(임의 수정 대신 보고만 함)

### Supabase 적용 및 스모크 테스트 결과 (사용자 직접 수행, 2026-07-15)

- 적용 전 충돌 검사: `public.school_growth_ranking_v1(timestamptz,timestamptz,integer)` 미존재, `idx_profiles_visible_created_school` 미존재 — 신규 생성만 발생함을 사전 확인
- migration 적용: Supabase SQL Editor에서 `20260715120000_school_growth_ranking_rpc.sql` 실행 → Success, 부분 인덱스·RPC·`anon`/`authenticated` 권한 실제 생성 확인
- 최근 7일 조회: 0 rows — 실제 공개 프로필 최신 `created_at`이 2026-07-05로, 최근 7일 신규 등록이 없다는 실제 데이터와 일치(오탐 아님)
- 전체 기간(2000-01-01 ~ 현재) TOP 5 조회: 신규 공개 프로필 수 6, 4, 3, 2, 2 순으로 정상 반환. 동률 2개 학교는 `most_recent_registration_at` 내림차순으로 정확히 정렬. 개인정보 필드 없음. `visible_profile_count`가 실제 누적 공개 프로필 수와 일치
- 프로필 진단: 전체 25건, 공개 25건, `oldest_created_at` 2026-05-27T20:17:37.568094+00, `newest_created_at` 2026-07-05T21:02:24.297593+00
- `anon` 권한 검증: `BEGIN; SET LOCAL ROLE anon; SELECT * FROM public.school_growth_ranking_v1(...); ROLLBACK;` 구조로 실행 → anon 역할에서도 동일한 TOP 5 5행 정상 반환, `EXECUTE` 권한·`SECURITY INVOKER`·기존 RLS와의 호환성 모두 오류 없이 확인됨
- 실제 검증에서 발견된 결함 없음 — migration 파일과 구현 코드는 이번에 수정하지 않음

### 관련 파일

- `lib/policy/levelPolicy.ts` (`threshold` export 추가)
- `lib/policy/schoolGrowth.ts` (`effectiveLevel` 기준 진행률 계산 보완)
- `lib/policy/schoolGrowth.test.ts` (q/r/s/t 등 신규 테스트 5개 추가)
- `lib/policy/growthPeriod.ts` (신규)
- `lib/policy/growthPeriod.test.ts` (신규, 12 tests)
- `supabase/migrations/20260715120000_school_growth_ranking_rpc.sql` (신규; 최종 SELECT에 결정적 ORDER BY 보정 — CTE 내부 정렬만으로는 최종 반환 순서가 보장되지 않아 `FROM ranked r` 뒤에 동일한 4단계 정렬을 명시적으로 추가; 이후 사용자가 Supabase SQL Editor에서 직접 적용 완료)
- `supabase/migrations/20260715120000_school_growth_ranking_rpc.test.ts` (신규, 정적 SQL 검토; 최종 ORDER BY 검증 + 인코딩 손상 문자 부재 검증 추가로 15 tests)
- `lib/api/schools.ts` (`getWeeklySchoolGrowthRanking`/`getTodayFastestGrowingSchool` 추가)
- `lib/api/schools.test.ts` (신규 테스트 13개 추가)
- `docs/decisions/2026-07-15-school-growth-ranking-rpc.md` (신규)
- `docs/IMPLEMENTATION_LOG.md`

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/levelPolicy.test.ts lib/policy/schoolGrowth.test.ts lib/policy/growthPeriod.test.ts lib/api/schools.test.ts supabase/migrations/20260715120000_school_growth_ranking_rpc.test.ts` → 78 passed
- `npm test` → 14 test files, 182 tests 통과 (기존 139 + 신규 43)
- `npm run build` → 이 세션의 도구 권한 설정으로 실행이 차단되어 직접 수행하지 못함(우회 시도 안 함) — 사용자가 PowerShell에서 직접 실행해 성공 확인함
- `git diff --check` → 공백 오류 없음
- migration 파일의 인코딩을 `file` 명령과 `od -c` 바이트 덤프로 직접 확인 — 정상 UTF-8, BOM 없음(저장소 내 다른 한국어 파일들과 동일 관례). PowerShell `Get-Content`에서 깨져 보인 것은 콘솔 표시 문제로 판단, 파일 내용은 수정하지 않음

### 비고

- Home UI, School Hub UI는 이번 Phase 1B에서도 구현하지 않음(RPC/래퍼/순수 계산까지만) — RPC가 실제 DB에 적용·검증된 상태로 이후 Phase에서 연결 가능
- migration은 사용자가 Supabase SQL Editor에서 직접 적용 완료했고, 실제 데이터로 스모크 테스트까지 마쳐 결함 없음을 확인함(위 "Supabase 적용 및 스모크 테스트 결과" 참고)
- 가짜 학교·가짜 순위·가짜 Level Up 없음, 전체 profiles 다운로드/학교별 N+1 없음
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-16

### 구현

- School Hub Growth UI Phase 2A — 학교 상세 페이지(`app/school/[slug]/page.tsx`) 상단을 School Growth Snapshot 기반 성장 패널로 전환. Home Growth Feed·State D·DB migration·RPC 수정은 이번 범위에 포함하지 않음
- `docs/decisions/2026-07-16-school-hub-growth-ui.md`(신규) 작성 — State A/B/C만 구현, State D·최대 Level 보류 근거, 임박 기준, State A "다음 레벨까지 1명" FROZEN 카피 적용, Home Feed보다 School Hub를 먼저 만드는 이유, `/invite` 대신 기존 `ShareButton` 재사용 근거를 기록
- **View model 순수 함수**(신규, `lib/policy/schoolHubGrowthView.ts`): `getSchoolStateContent(schoolState)`(State A/B/C별 제목·설명·helperText·주/보조 CTA, "동창" 표현 미사용), `buildSchoolStateCtaHref(kind, slug)`(기존 `/submit?school=`·`&self=1` 쿼리 관례만 재사용, 새 파라미터 없음, `discover`는 페이지 내 앵커, `share`는 href 없이 기존 `ShareButton`으로 렌더링), `formatRemainingToNextLabel`(State A는 `03-level-policy.md` §7에 따라 "다음 레벨까지 1명" 고정 카피, State B/C는 `snapshot.remainingToNext` 그대로), `formatProgressPercentLabel`
- **`SchoolGrowthPanel` 컴포넌트**(신규, `components/SchoolGrowthPanel.tsx`): 학교 이름+Lv. 배지+지역/유형/등록수 → State별 성장 메시지 → 성장 진행 영역(Lv.N→Lv.N+1, `레벨업 임박` 배지는 `snapshot.isNearLevelUp`일 때만, `role="progressbar"` + `aria-valuenow/min/max`로 접근성 텍스트 제공, `width: ${progressPercent}%`는 snapshot 값 그대로 사용) → 핵심 CTA(주 CTA는 Link, 보조 CTA가 `share`면 기존 `ShareButton` 재사용) → helperText(State B만)
- **`app/school/[slug]/page.tsx` 수정**: 장식용 타입별 배너 이미지(`schoolTypeImage`, 16:9 풀와이드)와 기존 "학교 헤더" 카드를 `SchoolGrowthPanel`로 교체. `getSchoolProfileCount(school.id)`(연도 필터 없는 학교 전체 공개 프로필 수)를 기존 `Promise.all` 병렬 호출에 1건만 추가해 `calculateSchoolGrowthSnapshot()`(순수 함수, DB 접근 없음)을 호출 — `school`은 `getSchoolBySlug()`가 이미 `select('*')`로 가져온 값이라 `current_level`/`level_updated_at` 재조회 없음(불필요한 중복 호출 방지). `syncSchoolLevel`은 호출하지 않음. 기존 연도 필터·프로필 리스트·빈 상태·페이지네이션·졸업년도 링크 블록을 `id="discover"`로 감싸 State C "사람 둘러보기" CTA가 페이지 내 앵커로 연결되게 함(새 라우트 없음). `SchoolWarmth`는 무수정 그대로 유지
- `types/school.ts`의 `School`에 `current_level?`, `level_updated_at?`(둘 다 optional, `12-db-schema.md` P1 컬럼을 타입에 반영) 추가 — optional로 둔 이유는 무관한 `lib/api/search.ts::SchoolSearchResult`/미사용 `components/SubmitForm.tsx`와의 불필요한 타입 충돌을 피하기 위함(그 파일들은 수정하지 않음)
- **Phase 2B — Level 정책 감사(코드 미수정, 별도 세션) 결과에 따라 내부 Level/XP와 공개 사람 수 성장 단계를 분리**: 감사에서 공개 프로필 6명 학교가 Lv.1·"다음 Level까지 135명"·진행률 4%로 정확히 계산됨에도 State B 화면이 항상 "조금만 더 모이면 다음 Level로 올라가요."를 표시해(State B 상한 10명으로는 Level 2 threshold 141에 구조적으로 도달 불가) 실제와 다른 문구를 보여주고 있음을 확인 — 감사 대안 A/B/C 중 대안 C(내부 Level 유지 + 화면에 별도 사람 수 성장 목표 표시)를 채택(`docs/decisions/2026-07-16-school-hub-growth-ui.md` Addendum에 근거 기록)
- **사람 수 기반 성장 단계 순수 함수 추가**(`lib/policy/schoolHubGrowthView.ts`): `calculatePeopleGrowthStage(schoolState, visibleProfileCount)`(XP/`remainingToNext`를 입력·계산에 전혀 사용하지 않음 — State A: `remainingPeople=1, progressPercent=0`, State B: `remainingPeople=11-count`, `progressPercent=round(((count-1)/10)*100)` 0~100 clamp, `remainingPeople<=2`면 `isNearGrowth`, State C: `progressPercent=100, isComplete=true`, 다음 목표 없음), `formatPeopleGrowthRemainingLabel(schoolState, stage)`(State A "첫 기록까지 1명", State B "다음 성장 단계까지 N명", State C는 null), `formatPeopleGrowthDescription(remainingPeople)`("N명만 더 모이면 다음 성장 단계로 이어져요.", "Level" 표현 미사용). State B → C 진입 기준(11명)은 새 값이 아니라 `lib/policy/schoolGrowth.ts::classifySchoolState`의 기존 경계를 그대로 재사용
- **State B 고정 카피 제거**: `getSchoolStateContent('B').description`을 `null`로 변경(정적 카피 없음을 타입으로 명시, `SchoolStateContent.description`을 `string | null`로 변경)하고 실제 표시는 `formatPeopleGrowthDescription`이 담당하도록 화면 레이어로 이동. `helperText`도 "이름을 남기면 학교의 다음 Level에 가까워져요." → "이름을 남기면 다음 성장 단계에 가까워져요."로 수정해 "Level" 표현을 제거. 기존 `formatRemainingToNextLabel`/`formatProgressPercentLabel`(XP 기반)은 삭제하지 않고 그대로 유지(다른 잠재적 소비자를 위해 보존, 현재는 아무도 호출하지 않음)
- **`SchoolGrowthPanel` 성장 진행 영역을 XP 기반에서 사람 수 기반으로 교체**(`components/SchoolGrowthPanel.tsx`): 기존 `Lv.N → Lv.N+1` 큰 진행 영역과 XP `progressPercent`/`remainingToNext` 표시를 제거. Level은 학교 이름 옆 `Lv.{effectiveLevel}` 배지 + `isNearLevelUp`일 때만 붙는 작은 "레벨업 임박" 배지로만 유지(색상: indigo 계열). 그 아래 "학교 성장" 섹션을 새로 추가해 `calculatePeopleGrowthStage` 결과로 진행 바(색상: blue 계열, XP 바와 시각적으로 분리)·실제 공개 프로필 수·`formatPeopleGrowthRemainingLabel`·`isNearGrowth`일 때 "성장 임박" 배지(State C 완료 상태는 "활발하게 이어지는 학교")를 표시
- **State A 중복 CTA 정리**(`app/school/[slug]/page.tsx`): 사람 발견 영역의 프로필 0명 빈 상태에서 기존에 중복으로 존재하던 "친구 이름 남기기" 버튼과 두 번째 `ShareButton`(공유 버튼)을 제거 — 등록/공유 CTA는 상단 `SchoolGrowthPanel`(State A 주 CTA "첫 이름 남기기", 보조 CTA "학교 공유하기")에만 남기고, 빈 상태는 설명 텍스트(이모지 + 안내 문구 + 사회적 증거 조건부 노출)만 유지. 더 이상 쓰이지 않는 `ShareButton` import를 `page.tsx`에서 제거(컴포넌트 자체는 `SchoolGrowthPanel.tsx`가 계속 사용, 삭제 아님)
- **디자인 색상 보완**: `tailwind.config.ts`의 `brand.blue`가 "브랜드 컬러를 흑백 모노톤으로 통일"이라는 기존 사이트 전역 결정에 따라 실제로는 거의 검정(`#0a0a0a`)임을 확인 — 이 전역 토큰은 School Hub만을 위해 바꾸지 않고, `SchoolGrowthPanel.tsx` 내부에서만 Tailwind 기본 팔레트 `indigo`(Level 배지·레벨업 임박)/`blue`(사람 수 성장 바·성장 임박 배지)를 사용해 "브랜드 보라·파랑 계열" 요청을 시각화. 그라데이션·애니메이션은 추가하지 않고 기존 카드 구조(`p-5 space-y-4`, `rounded-xl bg-gray-50 p-3.5`)와 CTA 스타일(`btn-primary` 등)은 무수정 유지

### 확인된 사실 / 범위 결정

- Year(`[year]/page.tsx`)·Class(`[year]/[class]/page.tsx`) 페이지는 이번 범위에 포함하지 않음 — `05-school-hub.md`가 School Hub(최상위)만 State 대상으로 정의하고, Product Constitution이 Year/Class를 별도 "필터" 계층으로 정의하기 때문(결정 문서에 근거 기록)
- "최대 Level이라 nextLevel이 null" 지시는 `03-level-policy.md` §1/§9("최대 레벨은 없다")와 충돌해 구현하지 않음 — `SchoolGrowthSnapshot.nextLevel`은 항상 number이므로 null 분기 자체가 발생하지 않음(결정 문서에 근거 기록)
- Growth Snapshot은 순수 함수라 그 자체로는 실패할 수 없음(Phase 1B에서 이미 21개 테스트로 검증) — 유일한 실패 경로는 `getSchoolProfileCount`가 DB 오류 시 조용히 0을 반환하는 기존 계약(Phase 0부터 존재, 이번에 변경하지 않음)이며, 이는 이번 범위에서 고치지 않는 기존 한계로 보고만 함
- 학교 헤더의 "연도 범위"(예: "2015~2020년") 보조 표시는 제거함 — 기존 "기능"(연도별 탐색 자체)이 아니라 부가 통계 표시였고, 실제 연도 탐색(연도 필터 chips + 졸업년도 링크)은 그대로 유지됨
- **(Phase 2B) State D는 계속 보류함** — 완성도(Completion) 계산식 미확정이라는 동일한 이유로 이번에도 구현하지 않음, `types/schoolGrowth.ts::SchoolState`는 그대로 `'A' | 'B' | 'C'` 유지
- **(Phase 2B) Level threshold 공식·cumulativeXp 계산·Register Flow·Admin Level Sync·DB/RPC/migration은 감사 대안 C의 전제(내부 Level 유지) 그대로 무수정** — 이번 Phase는 화면 표시 레이어(`schoolHubGrowthView.ts`, `SchoolGrowthPanel.tsx`, `page.tsx`의 빈 상태 블록)만 변경함

### 관련 파일

- `lib/policy/schoolHubGrowthView.ts` (Phase 2A 신규 + Phase 2B 수정: `PeopleGrowthStage`/`calculatePeopleGrowthStage`/`formatPeopleGrowthRemainingLabel`/`formatPeopleGrowthDescription` 추가, `SchoolStateContent.description`을 `string | null`로 변경, State B `description`/`helperText` 문구 수정)
- `lib/policy/schoolHubGrowthView.test.ts` (Phase 2A 신규 15 tests + Phase 2B 신규 15 tests = 30 tests, 기존 State B 관련 테스트 2개는 새 정책에 맞게 갱신)
- `components/SchoolGrowthPanel.tsx` (Phase 2A 신규 + Phase 2B 수정: XP 기반 성장 진행 영역을 사람 수 기반으로 교체, Level 배지/성장 바 색상 분리)
- `app/school/[slug]/page.tsx` (Phase 2A 상단 구조 교체 + Phase 2B: 빈 상태 블록의 중복 CTA 2개 제거, 미사용 `ShareButton` import 제거)
- `types/school.ts` (`current_level`/`level_updated_at` optional 필드 추가, Phase 2B 무수정)
- `docs/decisions/2026-07-16-school-hub-growth-ui.md` (Phase 2A 신규 + Phase 2B: Addendum 섹션 추가)
- `docs/IMPLEMENTATION_LOG.md`

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/schoolHubGrowthView.test.ts` → 30 passed (Phase 2B 반영 최신 결과)
- `npm test` → 15 test files, 212 tests 통과 (기존 197 + Phase 2B 신규 15)
- `npm run build` → 이 세션의 도구 권한 설정으로 실행이 차단되어 수행하지 못함(우회 시도 안 함) — 사용자가 PowerShell에서 직접 실행 필요
- `git diff --check` → 공백 오류 없음

### 비고

- State D, Completion 계산식, Home Growth Feed UI, Home 순위 UI는 이번에도 구현하지 않음
- Register Flow·Invite Flow 내부 동작, Admin, DB schema/migration/RPC, Home UI, `SchoolWarmth` 내부 동작은 Phase 2A/2B 모두 무수정
- React UI 테스트 도구가 저장소에 없어 페이지 컴포넌트 자체의 렌더링 테스트는 하지 않음 — 순수 view model(`schoolHubGrowthView.ts`)과 기존에 이미 검증된 `schoolGrowth.ts`/`getSchoolProfileCount` 테스트로 커버되는 범위만 자동 테스트하고, 나머지(존재하지 않는 slug의 notFound, metadata 생성 유지, Bottom Navigation 유지, Year/Class 탐색 유지, 390px/430px/데스크톱 레이아웃)는 코드 diff 리뷰로만 확인함 — 실제 브라우저 수동 검증은 아직 수행하지 않음(남은 blocker로 보고)
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-17

### 구현

- School Hub Growth UI Phase 2B 최종 점검 — 기준 커밋(`d6d1558`) 대비 미커밋 Phase 2A/2B 구현(`app/school/[slug]/page.tsx`, `components/SchoolGrowthPanel.tsx`, `lib/policy/schoolHubGrowthView.ts`/`.test.ts`, `types/school.ts`, 두 결정 문서)을 코드 레벨로 재검토
- 사람 수 기반 성장 계산(`calculatePeopleGrowthStage`), State B 동적 문구(`formatPeopleGrowthDescription`), State A 중복 CTA 제거(`page.tsx` 빈 상태 블록), Level 배지/성장 진행 바 색상 분리는 이미 요구사항과 정확히 일치함을 확인 — 추가 로직 변경 없음
- 확인된 결함 1건 수정: `components/SchoolGrowthPanel.tsx`의 State C(완료 상태) 문구가 "성장 목표 달성"으로 표시되고 있었으나, 지시된 문구는 "활발하게 이어지는 학교"였음 — 해당 문자열만 정정(계산 로직·`isComplete` 판단 기준은 무수정)
- `docs/IMPLEMENTATION_LOG.md`의 2026-07-16 기존 항목 중 위 문구를 언급한 한 곳만 실제 구현과 일치하도록 함께 정정(새 완료 항목 생성 아님)

### 관련 파일

- `components/SchoolGrowthPanel.tsx` (State C 완료 문구 정정: "성장 목표 달성" → "활발하게 이어지는 학교")
- `docs/IMPLEMENTATION_LOG.md` (2026-07-16 항목의 동일 문구 언급 정정 + 이번 점검 기록 추가)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/schoolHubGrowthView.test.ts` → 30 passed
- `npm test` → 15 test files, 212 tests 통과 (Phase 2B 기준과 동일, 회귀 없음)
- `git diff --check` → 공백 오류 없음
- `npm run build`는 이번 세션에서 실행하지 않음(사용자가 PowerShell에서 직접 실행 예정)

### 비고

- State C 완료 문구는 React 컴포넌트 JSX 리터럴이라 순수 함수 테스트로 커버되지 않음 — 저장소에 React 렌더링 테스트 도구가 없다는 기존 제약(2026-07-16 항목에 이미 기록)과 동일. 실제 화면 확인은 수동 브라우저 검증 필요(아래 수동 재검증 URL 참고)
- Level threshold/cumulativeXp, Register Flow, Admin, DB/RPC/migration, Home UI, State D는 이번에도 무수정
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-17 (2)

### 구현

- Home Growth Feed v2 — Phase 3A 구현 (`docs/decisions/2026-07-17-home-growth-feed-v2.md` 참고)
- `app/page.tsx`를 검색 Hero + 추억 슬라이더 + 정적 통계 중심 MVP에서, 실제 활동이 이어지는 성장 피드로 전면 교체
  - 상단: 로고 + `<form method="get" action="/search">` 순수 GET 검색 폼(새 클라이언트 컴포넌트/훅 추가하지 않음, `/search` 페이지의 기존 검색 폼 패턴 그대로 재사용)
  - 오늘 가장 빠르게 성장한 학교: 기존 `getTodayFastestGrowingSchool` 재사용, 실제 데이터 없으면 스트립 자체를 렌더링하지 않음
  - 최근 활동 피드: 신규 `lib/api/homeFeed.ts::getRecentRegisterActivity`/`getRecentTraceActivity`가 각각 최신 16건만 제한 조회(school은 join으로 한 번에 가져와 N+1 없음), `lib/policy/homeFeed.ts::buildHomeActivityFeed`가 두 원천을 `created_at` 내림차순으로 병합
  - 이번 주 학교 성장 순위 TOP 5: 기존 `getWeeklySchoolGrowthRanking`/RPC 계약 재사용 + 신규 `getWeeklySchoolGrowthRankingWithStatus`로 RPC 오류와 실제 빈 순위를 구분(오류를 가짜 빈 상태로 위장하지 않음)
  - 순위 각 행의 사람 수 성장 표시는 School Hub의 `calculatePeopleGrowthStage`/`formatPeopleGrowthRemainingLabel`을 `lib/policy/homeFeed.ts::buildWeeklyRankingViewRow`에서 그대로 재사용(Level curve 재구현 없음)
  - 피드 CTA(검색/등록)는 `getFeedCtaVisibility(itemCount)`가 활동 4개/8개 이상일 때만 각각 노출하도록 배치(첫 CTA가 첫 활동보다 먼저 나오지 않도록 레이아웃 순서 자체를 피드→순위→피드→CTA로 고정)
- `types/ranking.ts`의 `GrowthRankingInput`/`GrowthRankingRow`에 `visibleProfileCount`를 추가 — RPC가 이미 반환하던 `visible_profile_count`를 TypeScript 매핑(`mapGrowthRankingRow`)이 내부에서만 쓰고 외부에 노출하지 않던 공백을 채움(RPC/DB 무수정, 매핑 함수만 필드 추가)
- `lib/api/schools.ts`의 `fetchGrowthRanking`을 `{status:'ok', rows} | {status:'error'}` 반환으로 리팩터링하고, 기존 `getWeeklySchoolGrowthRanking`/`getTodayFastestGrowingSchool`은 이 결과를 그대로 unwrap하도록 변경(외부 계약·기존 테스트 동작 무변경, 회귀 테스트로 확인) — Home 전용 `getWeeklySchoolGrowthRankingWithStatus` 신규 추가
- Level Up 활동은 구현하지 않음 — `schools.current_level`/`level_updated_at`은 현재 상태 스냅샷일 뿐 "언제 어느 Level에서 어느 Level로 올랐는가"를 확정할 이벤트 이력이 저장소에 없어, 현재 상태를 이벤트로 위장하지 않기 위해 제외(블로커로 기록). 대신 `current_level`을 활동/순위 행 옆에 `Lv.N` 보조 배지로만 표시(이미 조회된 join/RPC 결과라 추가 조회 없음)
- trace는 이번 Phase에서 최근 활동 피드에 포함 — `lib/api/traces.ts`/`components/SchoolWarmth.tsx`를 직접 확인한 결과 `traces.message`가 이미 모든 방문자에게 공개 표시되는 기존 기능이고(is_hidden=false 필터, 개인 식별 필드 없음), `school_id`/`created_at`이 모두 존재해 안전 근거가 확인됨. 원문 그대로 노출하지 않고 `formatTraceActivityText`가 20자로 잘라 짧게만 표시
- 개인 이름/인스타그램 ID는 `lib/api/homeFeed.ts`의 두 조회 함수가 애초에 select하지 않음(원천 배제), Upstash 방문자 카운트(`lib/api/views.ts`)는 연결하지 않음

### 관련 파일

- `app/page.tsx` (전면 교체)
- `types/homeFeed.ts` (신규)
- `types/ranking.ts` (`visibleProfileCount` 필드 추가)
- `lib/policy/homeFeed.ts` (신규), `lib/policy/homeFeed.test.ts` (신규, 23 tests)
- `lib/api/homeFeed.ts` (신규), `lib/api/homeFeed.test.ts` (신규, 6 tests)
- `lib/api/schools.ts` (`fetchGrowthRanking` 상태 반환으로 리팩터링, `getWeeklySchoolGrowthRankingWithStatus` 추가)
- `lib/api/schools.test.ts` (`visibleProfileCount`/`WithStatus` 테스트 4개 추가)
- `lib/policy/schoolRanking.test.ts` (`visibleProfileCount` 필드 보완, 타입 오류 수정)
- `components/TodayGrowthStrip.tsx`, `components/HomeActivityFeed.tsx`, `components/HomeActivityItem.tsx`, `components/WeeklyGrowthRanking.tsx`, `components/HomeFeedCta.tsx` (신규)
- `docs/decisions/2026-07-17-home-growth-feed-v2.md` (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/homeFeed.test.ts lib/api/homeFeed.test.ts lib/api/schools.test.ts lib/policy/schoolRanking.test.ts` → 신규/수정분 전부 통과
- `npm test` → 18 test files, 251 tests 통과 (신규 테스트 파일 2개 + 기존 파일 2개에 33개 신규 케이스 추가, 전체 회귀 없음)
- `git diff --check` → 공백 오류 없음(줄바꿈 문자 관련 경고만 있음, 실제 오류 아님)
- `npm run build`는 이번 세션에서 실행하지 않음(사용자가 PowerShell에서 직접 실행 예정)
- 실제 Supabase 환경에서의 브라우저 smoke test는 이번 세션에서 수행하지 않음(사용자가 직접 확인 예정 — 아래 최종 보고의 수동 검증 항목 참고)

### 비고

- 남은 blocker: Level Up 이벤트 이력 테이블/스키마 없음(별도 migration 필요, 이번 범위 밖). `supabase/migrations/20260715120000_school_growth_ranking_rpc.sql`이 아직 Supabase에 적용되지 않아, 적용 전까지는 오늘 성장 스트립/주간 순위가 항상 숨김 또는 오류 상태로만 보임(코드 결함 아님, 인프라 적용 여부 문제)
- School Hub, Level 정책, Register Flow, Admin, DB/migration/RPC SQL은 이번에도 무수정
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-17 (3)

### 구현

- Home Activity Feed Quality — Phase 4A 구현 (`docs/decisions/2026-07-17-home-activity-grouping.md` 참고)
- 같은 학교(slug) + 같은 졸업연도(graduationYear) + 같은 날짜(`created_at`의 UTC 날짜, `YYYY-MM-DD`)인 실제 등록(register) 활동만 하나의 활동으로 묶는 `groupRegisterActivity`를 `lib/policy/homeFeed.ts`에 추가. 학교/졸업연도/날짜 중 하나라도 다르면 절대 합치지 않음. 졸업연도가 없는(`null`) 등록은 "같은 학교 + 같은 날짜"만으로 묶음
- 각 묶음은 실제 원본 등록 건수를 `count`로 그대로 보존(가짜로 늘리거나 줄이지 않음). 묶음의 대표 `createdAt`은 묶음 안에서 가장 최신인 원본 `created_at`
- `formatRegisterActivityText(schoolName, graduationYear, count = 1)`에 `count` 인자를 추가해 단수(`count===1`, 기존 문구 그대로)/복수(`count>=2`, "이름 N개가 새로 남겨졌어요") 문구를 분기. 두 문구 모두 개인 이름/닉네임/Instagram ID를 포함하지 않음(기존과 동일하게 입력으로도 받지 않음)
- trace 활동은 이번에도 개별 항목으로 유지 — 등록과 합치지 않고, trace끼리도 합치지 않음(메시지가 자유 텍스트라 대표를 정할 근거가 없어 묶으면 정보 손실이 생기기 때문)
- `buildHomeActivityFeed`가 (1) 등록 행을 `groupRegisterActivity`로 묶고 → (2) trace와 병합해 대표/원본 `createdAt` 내림차순으로 정렬 → (3) 최종 배열에 `limit`을 적용하는 순서로 동작하도록 변경(limit은 묶기 이전 원본이 아니라 묶은 뒤 최종 배열에 적용)
- `lib/api/homeFeed.ts`의 `HOME_ACTIVITY_FETCH_LIMIT`(16, 등록/흔적 공용)를 세 상수로 분리: `HOME_REGISTER_FETCH_LIMIT`(24, 묶기로 인한 화면 활동 감소를 상쇄하기 위해 24~32 범위 안에서 증가 — 여전히 고정 limit 조회, 전체 조회 아님, join/N+1 구조 무수정), `HOME_TRACE_FETCH_LIMIT`(16, 묶지 않으므로 기존 그대로), `HOME_ACTIVITY_FEED_LIMIT`(16, 묶은 뒤 화면 최종 노출 상한 — 기존 최종 화면 상한과 동일하게 유지)
- `app/page.tsx`는 `HOME_ACTIVITY_FETCH_LIMIT` → `HOME_ACTIVITY_FEED_LIMIT` import/사용처만 교체(레이아웃·CTA 배치 로직 자체는 무수정 — `getFeedCtaVisibility(activityItems.length)`가 이미 `buildHomeActivityFeed`의 최종 반환 길이를 인자로 받고 있어 묶은 뒤 개수 기준으로 자연스럽게 동작)
- `types/homeFeed.ts`의 `HomeActivityItem`에 `count: number` 필드만 최소 추가 — `type` 필드가 이미 register/trace 구분자 역할을 하고 있어 별도 `activityKind`를 추가하지 않았고, `slug`가 이미 School Hub 링크 키로 쓰이고 있어 `schoolSlug`로 리네임하지 않았으며, `graduationYear`는 이미 완성된 `text`에 반영돼 있어 화면이 별도로 필요로 하지 않아 추가하지 않음(최소 추가 원칙)

### 관련 파일

- `types/homeFeed.ts` (`HomeActivityItem.count` 필드 추가)
- `lib/policy/homeFeed.ts` (`formatRegisterActivityText` count 인자, `groupRegisterActivity`/`registerActivityDateKey` 신규, `buildHomeActivityFeed` 묶기 반영)
- `lib/policy/homeFeed.test.ts` (묶기 테스트 15개 신규 추가, 기존 register id 형식이 `register:p1`에서 `register:a-high::2020::2026-07-17`(학교+졸업연도+날짜 묶음 키)로 바뀐 것을 반영해 기존 테스트 2개 갱신)
- `lib/api/homeFeed.ts` (`HOME_ACTIVITY_FETCH_LIMIT` → `HOME_REGISTER_FETCH_LIMIT`/`HOME_TRACE_FETCH_LIMIT`/`HOME_ACTIVITY_FEED_LIMIT` 분리)
- `lib/api/homeFeed.test.ts` (새 limit 상수 테스트 3개 추가)
- `app/page.tsx` (import/사용 상수명만 교체)
- `docs/decisions/2026-07-17-home-activity-grouping.md` (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/homeFeed.test.ts lib/api/homeFeed.test.ts` → 44 tests 통과(신규 묶기/limit 테스트 포함)
- `npm test` → 18 test files, 266 tests 통과(Phase 3A 기준 251 tests에서 15개 신규 추가, 전체 회귀 없음)
- `git diff --check` → 공백 오류 없음(줄바꿈 문자 관련 경고만 있음, 실제 오류 아님)
- `npm run build`는 이번 세션에서 실행하지 않음(사용자가 PowerShell에서 직접 실행 예정)
- 실제 Supabase 환경에서의 브라우저 smoke test는 이번 세션에서 수행하지 않음(사용자가 직접 확인 예정 — 아래 최종 보고의 수동 검증 항목 참고)

### 비고

- 등록 활동은 화면 노출 전 항상 묶여서 표시되므로, 같은 학교·졸업연도·날짜에 등록이 1건뿐이면 기존과 동일한 단수 문구가 그대로 유지된다(회귀 없음)
- School Hub, Level 정책, 등록 API, DB/migration/RPC SQL, Admin은 이번에도 무수정
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-17 (Phase 4B)

### 구현

- 홈(`app/page.tsx`) 캐시 동작 감사: `revalidate`/`dynamic` route segment config가 전혀 없어 Next.js 15가 이 페이지를 완전 정적(SSG)으로 취급하고 있었고, 빌드 시점에 한 번 렌더링된 뒤 새 배포 전까지 절대 갱신되지 않는 상태였음을 실제 코드와 `npm run build`의 `○ /` 표시로 확인
- `app/page.tsx`에 `export const revalidate = 60`(ISR 60초) 추가 — 새 배포 없이도 최근 등록/흔적/오늘 성장/주간 순위가 최대 60초 이내로 최신화됨
- profile/trace 등록 성공 직후 홈을 즉시 재검증하는 최소 helper `revalidateHomeFeed()`(`lib/api/homeFeedCache.ts`) 추가 — `next/cache`의 `revalidatePath('/')`만 호출하고, 예외를 내부에서 흡수해 호출자에게 전파하지 않음(환경변수/사용자 데이터 로그 없음)
- `app/api/profiles/route.ts`: DB insert 성공(및 기존 Level sync 처리) 이후, 최종 `201` 응답 직전에 `revalidateHomeFeed()` 호출 추가. validation 실패/rate limit 차단/insert 실패(중복 포함) 경로에서는 호출하지 않음
- `app/api/traces/route.ts`: 동일하게 DB insert 성공 이후 최종 `201` 응답 직전에 `revalidateHomeFeed()` 호출 추가. validation 실패/rate limit 차단/dedupe 거절/insert 실패 경로에서는 호출하지 않음
- `force-dynamic`은 선택하지 않음 — 홈은 완전 공개·비개인화 페이지라 요청마다 DB를 조회할 근거가 없고, ISR 60초 + 성공 쓰기 후 즉시 재검증 조합만으로 "새 배포 없이 최신 데이터" 요구를 DB 비용 증가 없이 만족함
- DB/migration/RPC/School Hub/Admin/Level 정책/Upstash 방문자 카운트/rate limit fail-closed 정책/활동 묶음 정책/홈 디자인·문구는 이번에도 무수정

### 관련 파일

- `app/page.tsx` (`export const revalidate = 60` 추가)
- `app/page.test.ts` (신규 — 재검증 계약 소스 검증)
- `lib/api/homeFeedCache.ts` (신규)
- `lib/api/homeFeedCache.test.ts` (신규)
- `app/api/profiles/route.ts` (`revalidateHomeFeed()` 호출 추가)
- `app/api/profiles/route.test.ts` (재검증 계약 테스트 5개 추가, 기존 테스트 무수정)
- `app/api/traces/route.ts` (`revalidateHomeFeed()` 호출 추가)
- `app/api/traces/route.test.ts` (신규 — 기존 동작 회귀 테스트 7개 + 재검증 계약 테스트 6개)
- `docs/decisions/2026-07-17-home-feed-freshness.md` (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run` → 21 test files, 289 tests 통과(Phase 4A 기준 266 tests에서 23개 신규 추가 — `lib/api/homeFeedCache.test.ts` 2 + `app/page.test.ts` 2 + `app/api/profiles/route.test.ts` 신규 6 + `app/api/traces/route.test.ts`(신규 파일) 13, 기존 테스트 회귀 없음)
- `npm test` → 동일하게 21 test files, 289 tests 통과
- `git diff --check` → 공백 오류 없음(줄바꿈 문자 관련 경고만 있음, 실제 오류 아님)
- `npm run build`는 이번 세션에서 실행하지 않음(사용자가 PowerShell에서 직접 실행 예정)
- 실제 Supabase 환경에서의 재검증 동작(등록 후 홈이 실제로 갱신되는지) 브라우저 smoke test는 이번 세션에서 수행하지 않음(사용자가 직접 확인 예정)

### 비고

- `app/page.tsx`는 React Server Component(.tsx)라 현재 vitest 설정(esbuild 기본 변환, `tsconfig.json`의 `jsx: "preserve"`)으로는 직접 import해 렌더링 테스트를 할 수 없음(JSX 파싱 실패) — React 테스트 도구/새 의존성을 추가하지 않기로 한 제약과 결합해, `revalidate` export 계약은 컴포넌트를 import하는 대신 소스 텍스트를 정적으로 검사하는 방식(`app/page.test.ts`)으로 검증함
- School Hub, Level 정책, 등록 API의 나머지 로직(validation/rate limit/dedupe/Level sync), DB/migration/RPC SQL, Admin은 이번에도 무수정
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-17 (Phase 4C)

### 구현

- School Search Autocomplete 구현 (`docs/decisions/2026-07-17-school-search-autocomplete.md` 기준) — 홈과 `/search` 검색창에 타이핑만으로 실제 학교 후보가 드롭다운으로 뜨고, 후보 클릭/Enter 선택 시 해당 School Hub(`/school/[slug]`)로 바로 이동하도록 함. 기존에는 둘 다 순수 GET form이라 Enter를 눌러야만 `/search?q=`로 이동했음
- `lib/api/search.ts`: 기존 `searchSchools`(RPC `search_schools_v2` + 학교별 `profiles` count N+1)에서 RPC 호출부를 `fetchSchoolsBySearchRpc` helper로 분리하고, 이를 재사용하는 `searchSchoolsForAutocomplete(query)`를 신규 추가(lim=6, N+1 count 조회 없음). 기존 `searchSchools`/`searchProfiles`/`searchAll`/`logSearch`는 동작 무변경
- `lib/policy/schoolSearchAutocomplete.ts`(신규): React 렌더링 없이 테스트 가능한 순수 로직 — 쿼리 정규화/최소 길이(2글자) 판정, 결과 6개 제한, `/school/[slug]`·`/search?q=` URL 생성, 키보드 ArrowUp/Down 순환 이동(`moveActiveIndex`), Enter 동작 판정(`resolveEnterAction`), `setTimeout` 기반 디바운스(250ms) + `requestId` 순번 기반 오래된 응답 무시를 담당하는 `createDebouncedAutocompleteSearcher` 팩토리
- `lib/hooks/useSchoolAutocomplete.ts`(신규): 위 컨트롤러의 콜백을 React state(`status: 'idle'|'loading'|'ok'|'error'`, `results`)로 반영만 하는 얇은 wrapper. 기존 `lib/hooks/useSchoolSearch.ts`(react-query 기반, `SubmitForm.tsx`가 실제로 사용 중인 학교+동문 통합 검색)는 계약이 달라 무수정으로 남김
- `components/SearchBar.tsx`: 저장소에 이미 있었지만 실제로는 어디서도 import되지 않던 죽은 코드(학교+동문 통합 검색 + 개인정보 노출)를 신규 계약으로 전면 교체 — `variant: 'home' | 'search'` prop으로 두 화면의 기존 입력창 모양(홈: rounded-full pill + lucide 아이콘, `/search`: rounded-xl + inline svg 아이콘)만 다르게 렌더링하고, 상태/로직은 완전히 공용
  - `role="combobox"`/`aria-expanded`/`aria-controls`/`aria-activedescendant` + `role="listbox"`/`role="option"`/`aria-selected`로 접근성 속성 부여
  - ArrowDown/ArrowUp: 후보 순환 이동 · Enter: 활성 후보 있으면 School Hub 이동, 없으면 기존 `/search?q=` 전체 검색 · Escape: 드롭다운만 닫음(입력값 유지)
  - 마우스 hover(`hover:bg-gray-50`, CSS pseudo-class)와 키보드 활성 상태(`bg-blue-50`, React state)를 다른 시각 신호로 분리
  - 바깥 클릭 시 닫힘, 입력창 재포커스 시 유효한 결과가 있으면 재오픈(재조회 없이 캐시된 결과 그대로 표시)
  - 후보에는 학교명·시도/시군구·학교 유형만 표시(개인 데이터·`profile_count` 없음), 긴 학교명은 `truncate`로 안전 처리, 드롭다운은 `z-50`(하단 탭바 `z-40`보다 위)로 입력창 너비를 그대로 따름
- `app/page.tsx`: 검색 `<form>`을 `<SearchBar variant="home" className="mt-4" />`로 교체(레이아웃 위치·활동 피드·성장 순위·CTA 무수정, 미사용된 `Search` import 제거)
- `app/search/page.tsx`: 검색 `<form>`을 `<SearchBar variant="search" initialQuery={q} className="mb-6" />`로 교체(URL의 `q` 값을 입력창 초기값으로 표시, 기존 전체 검색 결과 렌더링 로직 무수정)

### 관련 파일

- `lib/policy/schoolSearchAutocomplete.ts` (신규)
- `lib/policy/schoolSearchAutocomplete.test.ts` (신규 — 25 tests)
- `lib/hooks/useSchoolAutocomplete.ts` (신규)
- `lib/api/search.ts` (`fetchSchoolsBySearchRpc` helper 분리, `searchSchoolsForAutocomplete` 추가)
- `lib/api/search.test.ts` (신규 — 8 tests, 기존에 테스트 파일이 없었음)
- `components/SearchBar.tsx` (미사용 구현을 신규 자동완성 계약으로 전면 교체)
- `app/page.tsx` (검색 form → `SearchBar` 교체)
- `app/search/page.tsx` (검색 form → `SearchBar` 교체)
- `docs/decisions/2026-07-17-school-search-autocomplete.md` (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/policy/schoolSearchAutocomplete.test.ts lib/api/search.test.ts` → 2 test files, 31 tests 통과
- `npm test` → 23 test files, 320 tests 통과(Phase 4B 기준 289 tests에서 31개 신규 추가, 기존 테스트 회귀 없음)
- `git diff --check` → 공백 오류 없음(LF→CRLF 줄바꿈 경고만 있음, 실제 오류 아님)
- `npm run build`는 이번 세션에서 실행하지 않음(지시에 따라 생략)
- 실제 Supabase 환경(`.env.local` 존재)에서 `npm run dev`로 브라우저 smoke test 수행:
  - 홈에서 "진명여자고" 입력 → "학교를 찾는 중..." 로딩 상태 → 실제 후보(진명여자고등학교 · 서울특별시 양천구 · 고등학교) 표시 확인
  - ArrowDown으로 후보 활성화(파란 배경) → Enter → `/school/seoul-yangcheon-jinmyeongyeojagodeunghaggyo`(School Hub)로 정상 이동 확인
  - "진명여고"(RPC가 매칭하지 못하는 축약어) 입력 → "일치하는 학교를 찾지 못했어요" + 전체 검색 폴백 링크 표시 확인(0건 상태)
  - `/search?q=진명` 접근 → 입력창에 `q` 초기값 표시 + 자동완성 드롭다운과 기존 전체 검색 결과("학교 검색 결과" 섹션)가 동시에 정상 표시되어 충돌 없음 확인
  - 입력창 재포커스 없이 페이지 내 다른 영역(로고 텍스트) 클릭 → 드롭다운 닫힘 확인, 다시 입력창 클릭 → 재조회 없이 드롭다운 재표시 확인
  - Escape 키 → 드롭다운만 닫히고 전체 검색 결과와 입력값은 유지됨을 확인
  - 브라우저 콘솔에 자동완성 관련 오류 없음(기존에도 있던 Upstash 환경변수 누락 경고, GoTrueClient 중복 경고만 존재 — 둘 다 이번 변경과 무관)

### 비고

- 모바일 390px/430px 뷰포트에서의 실제 리사이즈 스크린샷 검증은 이번 세션의 브라우저 자동화 환경이 창 크기 변경을 반영하지 않아(리사이즈 API는 성공을 반환하지만 스크린샷 해상도가 그대로였음) 수행하지 못함. 대신 드롭다운이 `absolute left-0 right-0`로 입력창 너비를 그대로 따르고 고정 픽셀 너비가 없는 점, 긴 학교명에 `truncate`를 적용한 점, 입력창 wrapper 클래스 자체가 기존(변경 전) 홈/`/search` 폼과 동일한 점(기존에도 모바일에서 문제가 없었음)을 근거로 코드 검토만으로 판단함 — 실제 모바일 기기/뷰포트 확인은 후속 과제로 남김
- `search_schools_v2`가 "진명여고" 같은 단어 축약("여자고등학교"→"여고")은 매칭하지 못함(RPC는 지역 prefix 매칭용으로 설계됨) — 기존 RPC의 알려진 특성이며 이번 범위에서 RPC를 수정하지 않았으므로 그대로 둠
- 후보에 현재 Level을 보조 정보로 표시하는 옵션은 `search_schools_v2`가 `current_level`을 반환하지 않아 추가 조회 없이는 불가능해 생략함(N+1 금지와 상충) — decision 문서에 후속 과제로 기록
- DB/migration/RPC/School Hub/Home Feed/Level 정책/등록 API/Admin/`lib/api/schools.ts`(admin Level Sync용 검색)/`lib/hooks/useSchoolSearch.ts`(`SubmitForm.tsx`용)는 이번에도 무수정
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-17 (search_logs 원문 공개 조회 제거)

### 구현

- `search_logs`가 anon에게 SELECT가 열려 있어(테이블 GRANT 또는 RLS 정책) query 원문 + created_at 등 629건의 개별 로그 행이 외부에 노출될 수 있던 문제를 제거 — School Hub는 원본 로그가 아니라 "검색 횟수" 숫자만 필요하므로, 원본 행 조회를 완전히 막고 집계 전용 RPC 하나로만 접근하도록 좁힘(`docs/decisions/2026-07-17-search-logs-aggregate-rpc.md` 기준)
- 신규 migration `public.get_school_search_count(search_tokens text[])` 추가: `SECURITY DEFINER` + `SET search_path = ''`, `public.search_logs`를 스키마까지 명시해서 참조. 입력 배열에서 앞에서부터 최대 8개 토큰만 사용 → btrim 후 길이 2~100인 토큰만 사용 → 중복 제거 → 각 토큰마다 기존과 동일한 `query ILIKE '%' || token || '%'` 카운트 계산 → 최댓값 반환. id/query/created_at 등 개별 로그 행은 어떤 경우에도 반환하지 않음. `PUBLIC` 기본 EXECUTE 권한은 REVOKE하고 anon/authenticated/service_role에만 GRANT
- 같은 migration에서 `search_logs` 원본 공개 조회 제거: 기존 공개 조회 정책이 있다면 `DROP POLICY IF EXISTS`로 안전 제거하고, RLS 정책 유무와 무관하게 `REVOKE SELECT ON public.search_logs FROM anon, authenticated`로 테이블 단위 SELECT 권한 자체를 회수. `search_logs_insert` 정책과 컬럼 단위 INSERT 권한, service_role 권한은 변경하지 않음
- `lib/api/searches.ts`의 `getSchoolSearchCount()`에서 `search_logs` 직접 SELECT(토큰별 반복 `.ilike` 쿼리)를 제거하고, `schoolSearchTokens()`로 만든 토큰 배열을 그대로 `supabase.rpc('get_school_search_count', { search_tokens })`에 전달하는 구조로 변경. RPC 오류/비정상 반환값(null/문자열/NaN/Infinity)이면 기존과 동일하게 0을 반환해 페이지 렌더링이 깨지지 않도록 함. 함수 시그니처(`schoolName`, `_sido`)와 `schoolSearchTokens()`의 토큰 생성 의미는 그대로 유지
- 기존 `logSearch()`(INSERT, `lib/api/search.ts`)는 무수정 — RPC로 옮기지 않음

### 관련 파일

- `supabase/migrations/20260717120000_search_logs_aggregate_rpc.sql` (신규)
- `supabase/migrations/20260717120000_search_logs_aggregate_rpc.test.ts` (신규 — migration SQL 정적 검토 17 tests)
- `lib/api/searches.ts` (`getSchoolSearchCount()`를 RPC 호출 구조로 변경)
- `lib/api/searches.test.ts` (신규 — 기존에 테스트 파일이 없었음, 14 tests)
- `docs/decisions/2026-07-17-search-logs-aggregate-rpc.md` (신규)

### 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run lib/api/searches.test.ts supabase/migrations/20260717120000_search_logs_aggregate_rpc.test.ts` → 2 test files, 31 tests 통과
- `npm test` → 25 test files, 351 tests 통과(Phase 4C 기준 320 tests에서 31개 신규 추가, 기존 테스트 회귀 없음)
- `git diff --check` → 공백 오류 없음
- `search_logs` 직접 SELECT 잔존 여부 확인(`.from('search_logs')` grep) → 애플리케이션 코드(`app/`, `lib/`, `components/`)에는 `lib/api/search.ts`의 기존 `logSearch()` INSERT 한 곳만 남아 있고, 직접 SELECT는 전부 제거됨을 확인
- 원격 Supabase에는 이번 세션에서 migration을 적용하지 않음 — `supabase-schema.sql`/`supabase/migrations/`에 애초에 `search_logs` 테이블 자체가 없어(운영 DB에만 존재, 저장소-운영 스키마 drift 기존 확인 사항) 이 migration은 함수/권한 변경만 다루며 적용 전 운영 대시보드에서 실제 컬럼(`query`, `created_at`, `id`, `result_count`)과 기존 정책 이름을 재확인해야 함

### 비고

- migration의 `DROP POLICY IF EXISTS "anon can read search_logs counts"`는 운영 대시보드에서 확인된 실제 정책 이름을 가정한 것 — 이름이 다르면 no-op이 되므로 안전하지만, 적용 전 실제 이름을 다시 확인 필요
- rate limit/CAPTCHA/UI 변경은 이번 범위에 포함하지 않음(지시에 따라 생략)
- DB 데이터(기존 629건)는 수정·삭제하지 않음, git add/commit/push 없음
- collector/BoostKitchen 관련 내용 없음

---

## 2026-07-18 (Search logs RLS manual security sync 및 원격 검증)

### 적용된 migration

- `supabase/migrations/20260717120000_search_logs_aggregate_rpc.sql`
- `supabase/migrations/20260717130000_rls_manual_security_sync.sql`

두 migration 모두 별도 세션에서 원격 Supabase에 이미 적용된 상태였음을 이번 세션에서 읽기 전용 조회로 확인함(이번 세션 자체는 DB를 변경하지 않음).

### 최종 보안 상태(원격에서 확인된 상태)

- `anon`/`authenticated`의 `search_logs` 직접 `SELECT`는 테이블 권한·RLS 양쪽에서 차단됨
- `anon`/`authenticated`의 `search_logs` INSERT는 `query`, `result_count`, `clicked_school_id` 컬럼으로만 제한됨(`id`, `created_at`은 컬럼 권한 목록에 없어 기본값만 적용)
- `search_logs_insert` RLS 정책이 적용되어 있음(`query` 길이 1~100, `result_count`는 NULL 또는 0 이상)
- `search_logs_query_length_check`(길이 제약), `search_logs_result_count_check`(비음수 제약), `search_logs_clicked_school_id_fkey`(schools 외래키) 제약조건이 모두 적용돼 있음
- `public.get_school_search_count(text[])`는 집계된 `integer` 하나만 반환하며 개별 로그 행(`id`/`query`/`created_at`)은 어떤 경우에도 반환하지 않음
- 함수의 `PUBLIC` 기본 `EXECUTE` 권한은 회수돼 있고, `anon`/`authenticated`/`service_role`에만 `EXECUTE`가 허용돼 있음

### 원격 검증

- `supabase_migrations.schema_migrations`의 두 migration 이력이 로컬 파일 내용과 일치함(`statements` 대조)
- 원격 함수 정의(`pg_get_functiondef`)·테이블 컬럼·권한(`information_schema`/`pg_proc`/`pg_policies`)·제약조건·인덱스가 로컬 두 migration과 일치함
- SQL 직접 호출(`supabase db query --linked`)로 `get_school_search_count` 호출 성공
- anon PostgREST 호출(`supabase.rpc('get_school_search_count', ...)`)도 동일하게 성공(에러 없음, `number` 반환)
- `NULL`, 빈 배열 입력 모두 오류 없이 `0`을 반환함을 확인
- 원본 검색 로그 행(`query`/`id`/`created_at` 등)은 이번 검증 과정의 어떤 응답에서도 노출되지 않았음
- 이번 검증 과정에서 `INSERT`/`UPDATE`/`DELETE`/DDL 등 DB를 변경하는 명령은 실행하지 않음(전부 `SELECT` 전용)
- `public.get_school_search_count(text[])`는 단일 `integer`를 반환하는 함수이므로 행 정렬 검증은 적용 대상이 아니다. 비매칭 토큰, `NULL`, 빈 배열에 대한 SQL 직접 호출은 모두 오류 없이 `0`을 반환했고, anon PostgREST 호출도 `number` 타입의 `0`을 반환했다.

### 남은 후속 작업

- 후속 정적·원격 감사에서 `get_school_search_count`의 `ILIKE '%' || token || '%'`가 사용자 토큰의 `%`, `_`, `\`를 리터럴이 아닌 ILIKE 패턴 문자로 처리하는 문제가 발견됨 — SQL injection은 아니며(파라미터화된 SQL만 실행, 원본 로그 행 미반환), aggregate count 범위가 의도보다 넓어질 수 있는 정확성 문제임. `%`/`_`/`\` 와일드카드 리터럴 처리 보정 migration이 필요하며, 이 보정은 설계만 완료된 상태이고 아직 구현·적용되지 않았음
- 기존 적용 migration 파일(`20260717120000_search_logs_aggregate_rpc.sql`, `20260717130000_rls_manual_security_sync.sql`)은 이번 보정과 무관하게 수정하지 않음 — 새 migration으로만 해결할 예정
- `search_logs.query`용 trigram 인덱스는 이번 보안 보정과 분리된 별도 성능 migration으로 검토 예정(적용 여부 미결정, 현재 데이터 규모에서 시급성 없음)

### Migration B — 와일드카드 리터럴 처리 보정(로컬 구현, 원격 미적용)

- 신규 migration `supabase/migrations/20260718100000_escape_search_log_count_wildcards.sql` 로컬 구현. 기존 `20260717120000_search_logs_aggregate_rpc.sql`은 수정하지 않고(원격에 이미 적용되어 로컬과 일치 확인된 상태 그대로 유지), 이 후속 migration에서 `public.get_school_search_count(search_tokens text[])`를 `CREATE OR REPLACE`로 재정의함
- 함수명·인자(`search_tokens text[]`)·반환 타입(`integer`)·`LANGUAGE sql`·`STABLE`·`SECURITY DEFINER`·`SET search_path = ''`·`PUBLIC` REVOKE·`anon`/`authenticated`/`service_role` GRANT 등 기존 공개 계약은 전부 그대로 유지함
- `%`, `_`, `\` 리터럴 처리: `replace()`를 백슬래시 → `%` → `_` 순서로 3중 적용해 이스케이프한 뒤 `ILIKE (...) ESCAPE E'\\'`로 매칭 — 순서가 바뀌면 새로 만든 백슬래시가 다시 이스케이프되어 의미가 깨지므로 이 순서가 정확성의 핵심임
- 입력 배열 defense-in-depth 가드 추가: `cardinality(...) > 20`이면 예외 없이 빈 집합(→ 최종 0 반환)으로 처리. 정상 앱 경로(`schoolSearchTokens()`)는 구조적으로 최대 5개 토큰만 생성하므로 20은 충분한 여유이며, 기존 `[1:8]` 슬라이스가 이미 함수 내부 처리 비용을 완전히 상한선으로 막고 있어 이 가드는 HTTP payload 전송 비용 자체를 막지는 못함(그 방어는 PostgREST/플랫폼 계층의 몫) — 어디까지나 명백히 비정상적인 입력에 대한 추가 방어선
- trigram 인덱스는 포함하지 않음 — 성능 최적화는 이번 보안 보정과 분리된 별도 migration으로 검토 예정
- `lib/api/searches.ts`는 수정하지 않음 — TS는 `%`/`_`/`\`를 미리 이스케이프하지 않고 원문 토큰을 그대로 RPC에 전달하며, 이스케이프는 SQL 쪽 책임으로 유지

#### 관련 파일

- `supabase/migrations/20260718100000_escape_search_log_count_wildcards.sql` (신규)
- `supabase/migrations/20260718100000_escape_search_log_count_wildcards.test.ts` (신규 — migration SQL 정적 검토 24 tests)
- `lib/api/searches.test.ts` (와일드카드 문자 전달·토큰 상한 회귀 4 tests 추가, 기존 13 tests 무변경)

#### 로컬 검증

- `npx tsc --noEmit` → 오류 없음
- `npx vitest run supabase/migrations/20260718100000_escape_search_log_count_wildcards.test.ts` → 1 test file, 24 tests 통과
- `npx vitest run lib/api/searches.test.ts` → 1 test file, 17 tests 통과(기존 13 + 신규 4)
- `npm test` → 전체 스위트 통과(회귀 없음)

#### 아직 완료되지 않은 것

- 이번 단계는 로컬 구현·정적 테스트만 수행함 — **원격 Supabase에는 아직 적용하지 않음**
- 원격 스모크 테스트(SQL 직접 호출, anon PostgREST 호출)는 아직 수행하지 않음
- trigram 인덱스는 적용하지 않음(별도 검토 예정)
- git add/commit/push는 수행하지 않음

### Migration B 원격 적용 및 최종 검증 완료

위 "Migration B — 와일드카드 리터럴 처리 보정(로컬 구현, 원격 미적용)" 기록은 그 시점(로컬 구현 직후)의 사실이며 수정하지 않는다. 이후 별도 단계에서 3개 로컬 커밋(`43d0e2b`/`5c03262`/`ba73bcd`)을 `origin/main`에 push하고, Migration B를 원격 Supabase에 적용·검증한 결과는 다음과 같다.

#### 적용

- `20260718100000_escape_search_log_count_wildcards.sql`이 원격에 적용됨(`npx supabase db push`, 대상은 이 파일 하나뿐임을 dry-run으로 사전 확인 후 진행)
- 다른 migration은 함께 적용되지 않음 — 적용 직후 `npx supabase migration list`에서 4개 migration(`20260715120000`/`20260717120000`/`20260717130000`/`20260718100000`) 전부 local/remote 일치, `db push --dry-run`은 "Remote database is up to date." 반환
- 기존 migration 파일(`20260717120000_search_logs_aggregate_rpc.sql`, `20260717130000_rls_manual_security_sync.sql`)은 이번 적용 과정에서도 수정하지 않음

#### 함수 정의(원격에서 확인)

- 함수명·인자(`search_tokens text[]`)·반환(`integer`) 계약 유지
- `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`
- `search_path`가 빈 값으로 고정됨
- `public.search_logs`를 스키마까지 명시해서 참조
- 앞 8개 토큰만 처리(`[1:8]`), 토큰 길이 2~100, `DISTINCT`로 중복 제거
- 입력 배열이 20개를 초과하면 예외 없이 0으로 귀결(`cardinality` 가드)
- `%`, `_`, `\`를 리터럴로 처리(`ESCAPE E'\\'`)
- `PUBLIC` 기본 `EXECUTE` 권한 회수, `anon`/`authenticated`/`service_role`에는 `EXECUTE` 유지
- `pg_get_functiondef`로 확인한 원격 함수 본문이 로컬 migration과 논리적으로 완전히 일치함(서식만 Postgres 정규화)

#### 원격 smoke test(읽기 전용, 전부 synthetic 입력만 사용)

- `NULL` → 오류 없이 `0`
- 빈 배열 → 오류 없이 `0`
- 비매칭 synthetic 토큰 → 오류 없이 `0`
- 21개 synthetic 토큰 배열 → 오류 없이 `0`(cardinality 가드 작동 확인)
- `'%%'`, `'__'`(순수 와일드카드 조합) → **오류 없이 `0`** — 보정 전이었다면 전체 로그와 매칭됐을 입력이 정확히 리터럴로 처리됨을 실제 원격에서 확인
- `%`/`_`/`\`가 포함된 synthetic 토큰 → 오류 없이 처리됨
- anon PostgREST 경로(`supabase.rpc('get_school_search_count', ...)`)로 위 입력을 동일하게 호출 → 전부 성공, `number` 타입 반환
- 원본 검색 로그 행(`query`/`id`/`created_at`)은 SQL 직접 호출·anon RPC 호출 어디에서도 노출되지 않음
- anon 클라이언트로 `search_logs` 직접 SELECT를 시도하면 오류로 차단됨(반환된 count는 `null`, 행 데이터 미노출) — 기존 차단 상태 그대로 유지
- authenticated 역할도 `has_table_privilege` 기준 `search_logs` 직접 SELECT 권한 없음(anon과 동일)

#### 영향 범위

- **변경된 것**: `public.get_school_search_count(text[])` 함수 정의, 함수 COMMENT, 함수 EXECUTE 권한 재명시, migration history 1행 추가
- **변경되지 않은 것**: `search_logs` 테이블 데이터·구조, RLS 정책, 테이블 권한, 인덱스, extension, 다른 함수, Git 파일(이번 적용 단계 자체는 DB만 변경, 저장소 파일은 이전 커밋 이후 무변경)
- DB 데이터(운영 검색 로그) 변경 없음 — 전 과정 `SELECT` 전용, `INSERT`/`UPDATE`/`DELETE`/DDL 미실행

#### 테스트

- `npx tsc --noEmit` → 오류 없음
- `npm test` → `27 test files / 404 tests` 통과

#### 최종 판정

검색 로그 집계 RPC·RLS·와일드카드 보정 작업 완료.

원격 Vercel 배포 상태는 이번 작업 범위에서 읽기 전용 조회 도구(연결된 Vercel CLI, `gh` CLI 등)가 없어 검증되지 않았으므로 "완료"로 기록하지 않는다 — GitHub push 자체는 성공했고 3개 커밋이 `origin/main`에 반영됐음만 확인된 상태다.

### 남은 P2 — trigram 인덱스(성능 최적화, 보안과 무관)

- `search_logs.query`에 대한 trigram(GIN) 인덱스가 없어 `ILIKE '%...%'` 조회가 인덱스를 활용하지 못하고 순차 스캔에 의존한다.
- 이는 **보안 결함이 아니며 현재 기능을 차단하는 요소도 아니다** — 현재 `search_logs` 규모(수백 건)에서는 성능 문제가 관찰되지 않음.
- 데이터가 충분히 증가해 실제 성능 저하가 관찰될 때, 이번 보안 보정 migration과는 분리된 별도의 새 성능 migration으로만 검토·구현한다.
- 현재 이 항목을 구현하지 않는다(이번 단계 범위 아님).

---

## 2026-07-20 (PHASE 9 — 공개 등록 CAPTCHA 보호)

### 배경

`docs/design-package-v1.0/07-register-flow.md` §8과 `13-api.md` §8이 P1으로 명시한 "Registration은 CAPTCHA를 적용한다"를 구현. 기존에는 `app/api/profiles` 등록 API에 Rate Limit(Upstash)만 있고 CAPTCHA가 없었다.

### 선택한 공급자

Cloudflare Turnstile. 새 npm dependency 없이 공식 `<script>`(client 위젯)와 `fetch` 기반 REST 검증(서버)만으로 구현 — 로그인 없는 공개 form에 적합, 무료, client token + server verification 구조가 명확히 분리됨.

### 환경변수(Vercel에 설정 필요, 실제 값은 이 로그에 기록하지 않음)

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: 공개 키. client 위젯에서만 사용. 값이 없으면 등록 폼이 막히고 명확한 오류 문구를 보여준다(조용히 CAPTCHA를 생략하지 않음).
- `TURNSTILE_SECRET_KEY`: 비밀 키. 서버(`lib/security/captcha.ts`)에서만 사용. **client bundle에 노출되지 않음(빌드 산출물 검사로 확인 완료)**. production에서 값이 없으면 등록 API가 fail-closed(500)로 차단된다.
- Cloudflare 공식 테스트 키(dummy site/secret key)는 로컬 개발/테스트 전용이며 **production에서는 절대 사용하지 않는다**.

### 구조

- `lib/security/captcha.ts`(신규): 서버 전용 verification helper. timeout(5s)·HTTP 오류·JSON 파싱 오류·schema 불일치를 모두 fail-closed(500)로 처리, `success:false`는 400, action은 누락 없이 `register`와 정확히 일치해야 통과한다. 공급자 error-codes/token/secret은 로그에도 client 응답에도 원문을 노출하지 않는다.
- `app/api/profiles/route.ts`: Zod schema에 `captchaToken` 필수 필드 추가(빈 문자열/2048자 초과 거부). Rate Limit → JSON 파싱 → 전체 Zod 검증 → **CAPTCHA 검증** → DB insert 순서(문서 예시와 검증 순서가 다르지만, CAPTCHA 실패 요청이 DB에 도달하지 않는다는 핵심 요건은 동일하게 지킴 — Zod를 통과 못 할 요청에 대해 Cloudflare API 호출을 낭비하지 않기 위함). `captchaToken`은 DB insert 페이로드와 성공/실패 응답 어디에도 포함되지 않는다.
- `components/CaptchaWidget.tsx`(신규): Turnstile client 위젯. `app/submit/page.tsx`에서만 로드(전역 layout에 없음). 다중 등록(한 번에 여러 명)을 지원하는 기존 UX를 유지하기 위해 `requestNextToken()`을 노출 — Turnstile 토큰은 1회용이라, 배치의 첫 사람은 이미 받아둔 토큰을 쓰고 이후 사람마다 위젯을 reset+execute해 새 토큰을 받는다. 제출 전 만료·오류·timeout 뒤에도 별도 재시도 버튼으로 reset+execute해 새 challenge를 받을 수 있다.
- `app/submit/registerPeople.ts`: `registerPeople(people, base, getCaptchaToken)`로 시그니처 변경 — 사람마다 새 토큰을 요청해 요청 body에 포함한다.

### 테스트

- `lib/security/captcha.test.ts`(21 tests): 정상 검증, 실패, action 불일치·누락, secret 누락 production(fail-closed)/development·test(우회), 네트워크 오류·timeout·잘못된 JSON·HTTP 오류·schema 불일치(모두 fail-closed), 원문 미노출.
- `app/api/profiles/route.test.ts`(+12 tests): CAPTCHA 성공/실패/오류, 토큰 누락/빈 값/길이초과, rate limit 초과 시 CAPTCHA 미호출, DB insert 페이로드·응답에 토큰 미포함, 공급자 원문 미노출. 기존 43개 테스트는 CAPTCHA를 항상 성공으로 mock해 그대로 통과(약화 아님).
- `components/CaptchaWidget.test.ts`, `app/submit/page.test.ts`(신규): 소스 텍스트 기반 계약 확인(이 저장소는 RTL/jsdom 미사용).
- `app/submit/registerPeople.test.ts`: 기존 27개 호출부에 토큰 getter 인자 추가 + 배치 토큰 배급 신규 테스트 3개.

### 병합·배포 및 검증 상태 동기화

- Phase 9 Turnstile 코드와 Codex 작업 규칙은 PR #1을 통해 `main`에 포함됨.
- 실제 PR #1 병합 커밋은 `0acb8f2`이며, 부모 이력에 Phase 9 구현 커밋 `1730f1c`와 Codex 작업 규칙 커밋 `e17328a`가 포함됨.
- 이전에 전달받았던 `ca8c8f2`는 저장소에 존재하지 않는 잘못된 해시였으며 실제 병합 커밋으로 사용하지 않음.
- 기존 Phase 9 로컬 검증에서 Phase 9 대상 테스트, 전체 테스트, typecheck 및 production build가 통과함.
- 이번 상태 문서 동기화에서는 `git diff --check`가 통과했으며, 문서 전용 변경이므로 테스트·typecheck·build는 재실행하지 않음.
- Preview UI 검증 완료: Turnstile 위젯 렌더링, 보안 확인 성공, 등록 버튼 활성화 및 Preview hostname 오류 `110200` 해소를 확인함.
- Production UI 검증 완료: production `/submit`에서 Turnstile 위젯 렌더링, 보안 확인 성공, 등록 버튼 활성화 및 `110200` 오류 없음 확인.
- 실제 production 등록 write는 production과 Preview가 운영 Supabase를 사용해 운영 데이터와 학교 Level을 변경할 위험이 있으므로 의도적으로 실행하지 않음.
- 따라서 Production End-to-End Write 상태는 **미검증**이며, UI 검증 완료를 실제 등록 write 검증 완료로 간주하지 않음.

최종 상태:

- `CODE_PRESENT`
- `LOCAL_VERIFIED`
- `PREVIEW_UI_VERIFIED`
- `PRODUCTION_UI_VERIFIED`
- `PRODUCTION_END_TO_END_WRITE_NOT_TESTED`

### 남은 P2

- 지역(hostname) 검증은 적용하지 않음 — `schoollove.kr`/`www.schoollove.kr` 등 유효 호스트가 여러 개라 하드코딩 시 정상 트래픽 오차단 위험이 action 검증보다 크다고 판단.
- `lib/api/profiles.ts::insertProfile()`은 여전히 미사용 dead code이며 이번 phase에서도 손대지 않음(직접 연관 없음).

---

## 제품 개발 다음 단계(2026-07-18 기준 우선순위 — 구현 완료 기록과 별개)

검색 로그 RPC·RLS·와일드카드 보정 작업(위 기록)은 인프라·보안 계층 완료 상태이며, 아래는 그 위에서 진행할 제품 개발 우선순위 정리다. 실제 구현 여부는 각 항목이 완료 기록으로 남기 전까지는 미완료로 간주한다.

### 1순위 — 실제 서비스 연결 확인

- 배포된 사이트에서 학교 검색 횟수가 실제로 표시되는지 확인
- RPC 오류 발생 시 UI가 fallback(0 또는 대체 문구)으로 정상 동작하는지 확인
- 모바일에서 School Hub 진입 흐름이 끊기지 않는지 확인

### 2순위 — 게임형 성장 경험

- 학교 현재 레벨 표시
- 다음 레벨까지 남은 사람 수 표시
- "한 명만 더" CTA
- 첫 기록이 생긴 학교(State A) 상태 표현
- 레벨업 직전 학교 노출

### 3순위 — Home 성장 중계

- 방금 성장한 학교
- 오늘 처음 기록이 생긴 학교
- 레벨업 임박 학교
- 빠르게 성장한 학교
- 활동이 없는 경우의 fallback 화면

### 4순위 — 공유·소환

- 학교 성장 카드
- 친구 한 명 소환하기
- 해당 School Hub 직접 공유
- 학교·졸업연도가 미리 선택된 등록 흐름

### 5순위 — 새 마케팅 전략

- 감성은 세계관, 게임은 참여 엔진, 사람 발견은 보상이라는 구조
- 첫 시즌: "우리 학교 깨우기"
- 핵심 메시지: "우리 학교, 지금 몇 레벨일까?" / "한 명만 더 오면 레벨업"

---

## Registration Growth Feedback (2026-07-24)

- 등록 성공 화면을 기존 `growthReward` 계약에 연결해, 성공한 이름과 최종 제출 School/Year/Class context를 한 화면에서 확인할 수 있게 했다.
- 학교 공개 등록 인원, 현재 레벨, 다음 성장까지 남은 인원, 진행률은 클라이언트가 추정하지 않고 서버가 반환한 성장 스냅샷을 우선 사용한다. 성장 응답이 없는 이전 응답에 한해서만 기존 공개 프로필 count 조회를 안전한 fallback으로 유지한다.
- 여러 명 등록은 서버가 실제 생성해 반환한 nickname만 성공 이름으로 보존하며, 성공·중복·실패 수를 분리한다. 성공이 0명이면 성공 화면으로 이동하지 않고 입력값을 유지해 사용자가 직접 다시 시도할 수 있다.
- 즉시 ref 잠금과 disabled 상태로 중복 제출을 막고 자동 재시도는 추가하지 않았다. 제출 상태와 오류는 `aria-live`로 안내한다.
- 등록 성공 직후 Home과 최종 제출 context의 School/Year/Class 경로만 재검증한다. 학교 slug는 client payload가 아닌 서버 조회 결과를 사용하며, 기존 Home activity 생성 계약은 변경하지 않았다.
- DB schema, migration, RLS, API 인증, Turnstile, Upstash, 등록 데이터 구조, 레벨·성장 정책은 변경하지 않았다.
- 상태: `LOCAL_VERIFIED` — TypeScript, 관련 테스트, 전체 테스트, production build,
  `git diff --check` 및 1440/1024/412/390/360px 실제 브라우저 검증을 완료했다. 실제
  production 등록 write와 production UI 재검증은 실행하지 않았다.

---

## 2026-07-27 (Launch Measurement Minimum 병합 후 상태 동기화)

### 병합된 구현

- `da3aa68` (`feat: secure profile writes and add launch analytics (#19)`):
  `docs/decisions/2026-07-26-launch-measurement-minimum.md`에서 승인된 최소 측정·보안
  범위를 구현했다.
- Vercel Web Analytics는 root layout에 기본 page view 수집기 하나만 추가했다. custom
  event, 사용자 식별자, 검색어·nickname·Instagram ID 전송은 추가하지 않았다.
- 공개 등록 write는 `/api/profiles`의 Turnstile → 서버 검증 → service-role INSERT 경로로
  한정했다. 브라우저의 `profiles` 직접 접근은 공개 count/read 용도만 남아 있고 직접
  INSERT 호출은 존재하지 않는다.
- 신규 migration
  `supabase/migrations/20260726120000_profiles_api_only_write.sql`은
  `anon`/`authenticated`의 테이블·컬럼 `INSERT` 권한과 `profiles_insert` 정책만
  회수한다. 기존 migration 파일, 공개 SELECT, 데이터 행, service-role 권한은 변경하지
  않는다.
- 공개 write rate limiter의 기존 window·prefix·TTL·429 계약은 유지하고 Upstash
  `analytics: true`만 제거했다.
- `6c1165c` (`fix: restore submit button text contrast (#20)`): 등록 CTA와 성공 화면의
  버튼 텍스트 대비 회귀를 복구하고 계약 테스트를 추가했다.

### 2026-07-27 로컬 재검증

- 관련 테스트:
  `npx vitest run lib/security/launchMeasurementMinimum.test.ts supabase/migrations/20260726120000_profiles_api_only_write.test.ts app/api/profiles/route.test.ts app/submit/page.test.ts components/RegistrationSuccessFeedback.test.ts`
  → 5 test files / 84 tests 통과.
- `npm run typecheck` → 오류 없음.
- `npm test` → 65 test files / 884 tests 통과.
- `npm run build` → Next.js 15.3.8 production build 성공, 23개 static page 생성 완료.
  로컬 Upstash 환경변수 미설정 경고는 있었지만 production build 결과에는 영향을 주지
  않았다. 환경변수 값은 읽거나 출력하지 않았다.
- 작업 시작 시 수정 표시된 14개 TS/TSX 파일은 normalized Git hash가 모두 HEAD와
  동일하고 `git diff`도 비어 있어 실제 내용 변경이 아닌 worktree stat/줄바꿈 표시임을
  확인했다. 해당 파일은 수정·복원하지 않았다.

### 현재 상태와 원격 경계

- 코드와 migration: `LOCAL_VERIFIED`.
- Supabase production: `PRODUCTION_VERIFIED`. Database Migrations에서
  `20260726120000 profiles_api_only_write` 적용 이력과 원격 SQL이 로컬 migration과
  일치함을 확인했다. 이미 적용된 상태여서 migration을 중복 실행하지 않았다.
- Supabase 읽기 전용 권한 검증 결과: `anon`/`authenticated`의 테이블 INSERT와
  `nickname` 컬럼 INSERT는 모두 `false`, 공개 SELECT는 모두 `true`, `service_role`
  INSERT는 `true`였다. `profiles_insert` 정책은 없고 `profiles_read`와 RLS는 유지됐다.
- Vercel production: `PRODUCTION_VERIFIED`. 최신 production deployment는 `main`
  `6c1165c`로 `Ready`였고 `www.schoollove.kr`에 연결돼 있었다.
- Vercel Web Analytics Hobby 플랜을 활성화했다. production에서
  `@vercel/analytics/next` v2.0.1 스크립트와 first-party view endpoint 로드를 확인했고,
  검증 방문이 Visitors 1 / Page Views 2로 집계되며 `/`와 `/search`가 각각 1회 표시됨을
  확인했다. custom event는 추가하거나 전송하지 않았다.
- 실제 production 등록 write는 운영 데이터와 학교 Level을 변경하므로 실행하지 않았다.
- 원격 변경은 Vercel Web Analytics 활성화 1건뿐이다. Supabase에서는 권한·정책 SELECT만
  실행했고 migration·데이터 mutation은 수행하지 않았다.
- commit, push, deploy, 환경변수 변경은 수행하지 않았다.

---

## 2026-07-28 (PHASE 10A 개인정보 긴급 안전 전환)

### 구현

- 중앙 개인정보 정책 `lib/policy/privacySafety.ts`를 추가했다. 공개 프로필 등록은 환경변수 값과 무관하게 항상 차단하며, KST 기준 미래 졸업연도, 신뢰 가능한 `school_type`, 개인 관련 route의 noindex/nofollow/noarchive를 한 경계에서 판정한다.
- `POST /api/profiles`는 request body, CAPTCHA, rate limit, DB, level sync, revalidation보다 먼저 503과 `PROFILE_REGISTRATION_TEMPORARILY_DISABLED`를 반환한다. `/submit`과 `/invite`는 등록 폼·초대 동작 대신 정비 안내만 제공한다.
- Home의 profile 기반 피드·순위·등록 CTA를 제거했다. School은 학교명·지역·유형만 제공하고, Year/Class는 profile 행을 조회하지 않는 비공개 안내로 전환했다.
- 공개 Search는 학교 RPC만 사용하며 profiles 조회와 profile count 표시를 제거했다. 공개 개인 명단, 이름 검색, 개인 Instagram 링크는 활성 공개 경로에서 제거했다.
- sitemap은 Home과 School 기본 URL만 생성한다. search, submit, invite, Year, Class는 noindex/nofollow/noarchive이며 admin X-Robots-Tag에도 noarchive를 추가했다. robots.txt는 해당 경로를 차단하지 않아 meta robots 전달을 방해하지 않는다.
- 개인정보처리방침과 이용약관을 현재 실제 동작에 맞춰 갱신하고, 신규 등록 중단·만 19세 이상 본인 등록 전환·타인 정보 등록 금지·공개 명단/Instagram 중단·삭제 요청 경로를 명시했다.
- 신규 migration `20260728120000_profiles_private_safety_boundary.sql`을 작성했다. 기존 행을 삭제·수정하지 않고 `anon`/`authenticated`의 profiles SELECT/INSERT/UPDATE/DELETE, 알려진 공개 RLS 정책과 profile 기반 ranking RPC 실행 권한을 회수한다. service-role 관리자 경계는 변경하지 않는다.
- 새 결정 문서, FROZEN 안전 override, CHANGELOG와 AGENTS.md 최상위 계약에 PHASE 10A/10B 경계를 기록했다.

### 로컬 검증

- 변경 관련 테스트: 16 files / 112 tests 통과.
- `npm run typecheck` → 오류 없음.
- `npm test` → 68 files / 795 tests 통과. 관리자 API·인증·신고·삭제 관련 기존 테스트 포함.
- `npm run build` → Next.js 15.3.8 production build 성공, static page 23개 생성. 로컬 Upstash 환경변수 미설정 경고만 있었고 빌드 결과에는 영향을 주지 않았다. 환경변수 값은 읽거나 출력하지 않았다.
- `git diff --check` → 통과.

### 상태와 원격 경계

- 로컬 코드와 migration: `LOCAL_VERIFIED`.
- 원격 Supabase migration, 원격 데이터 mutation, Vercel 배포, 환경변수 변경, commit, push, PR은 실행하지 않았다.
- 따라서 Production의 기존 `profiles_read`/공개 SELECT는 신규 migration이 명시적으로 승인·적용되기 전까지 남아 있을 수 있다. 로컬 UI/API 차단만으로 원격 Supabase REST 직접 조회 위험이 제거됐다고 판정하지 않는다.
- PHASE 10B 시작점은 Supabase Auth, 만 19세 이상 자격, 본인 profile 소유권, 본인 전용 RLS/API, 승인 전 개인정보·Instagram 비공개, 기존 데이터 소유권 주장·삭제 절차다.

### PHASE 10A-R 감사 보완

- 초기 안전 패치에서 크게 축소됐던 `/api/profiles` 회귀 테스트를 원래 보안 계약 기준으로 복구했다. rate limit fail-closed, 입력 검증, CAPTCHA, service-role INSERT, 중복·오류 응답, level sync, revalidation 검증은 유지하고 모든 실행보다 앞선 PHASE 10A 503 hard lock 테스트를 추가했다.
- sitemap은 profile 기반 테스트를 복구하지 않고 새 계약에 맞춰 학교-only, 민감 URL 제외, 중복 제거, DB 오류 fail-safe, 연속 호출 freshness, dynamic route를 검증하도록 보강했다. 제거된 전체 테스트는 공개 profile/Year/Class/등록 UI라는 폐기된 동작을 검증하던 항목이며 관리자·보안 경계 테스트를 삭제해 수를 줄이지 않았다.
- FROZEN 본문은 개작하지 않고 각 관련 문서의 상단 supersession note만 추가된 상태를 재확인했다.

### PHASE 10A Production DB 적용

- 사용자 승인 후 Supabase Production 프로젝트 `ucnybhzpbatzcipwqtox`에 `20260728120000_profiles_private_safety_boundary.sql`을 단일 트랜잭션으로 적용하고 migration history를 기록했다.
- 적용 전에는 `profiles_read` 정책과 `anon`/`authenticated` SELECT, profile 기반 ranking RPC 실행 권한이 존재함을 확인했다. 개인 profile 행과 원문은 조회하지 않았다.
- 적용 후 `profiles` RLS 활성화, 공개 정책 0개, `anon`/`authenticated` SELECT/INSERT/UPDATE/DELETE 모두 false, 공개 역할의 컬럼 grant 0개, ranking RPC 실행 권한 false를 확인했다.
- `service_role`의 `profiles` SELECT/INSERT/UPDATE/DELETE는 모두 true로 유지됐다. 기존 행의 수정·삭제·추가 및 환경변수 변경은 없었다.
- 이 시점의 상태는 DB 경계 `PRODUCTION_VERIFIED`, 애플리케이션 배포 `PENDING`이다.
## 2026-07-28 (PHASE 10B 인증·성인 제한·프로필 소유권 기반)

### 구현

- 일반 사용자 인증은 Supabase Auth 이메일 OTP로 분리하고, 검증된 access/refresh token을 httpOnly·SameSite 쿠키로 보관한다. OTP 요청과 검증은 각각 별도의 IP·이메일 hash rate limit을 적용하며 Production에서 Upstash 설정이 없으면 fail-closed 한다.
- KST 기준 만 19세 이상 여부를 서버에서 계산한다. 원본 생년월일은 저장하거나 로그로 남기지 않으며, 성인 확인 레코드는 service-role 서버 경계에서만 생성해 authenticated REST 직접 INSERT 우회를 막는다.
- 필수 약관 동의는 정책 버전별 append-only 레코드로 저장한다. 현재 성인 확인과 필수 동의가 모두 존재할 때만 private profile 및 학교 이력 생성·수정이 허용된다.
- 신규 `private_profiles`와 `profile_school_memberships`는 검증된 Supabase session user ID를 소유자로 사용한다. RLS는 본인 row의 SELECT/INSERT/UPDATE/DELETE만 허용하고 공개 읽기 정책은 만들지 않는다.
- 기존 `profiles` row는 삭제하거나 임의 소유권을 부여하지 않는다. owner는 NULL, ownership은 quarantined, visibility는 private 경계로 유지하고 claim UI/API는 만들지 않는다.
- `/account`에서 성인 확인, 필수 동의, 기본 비공개 프로필, 학교 이력, 본인 삭제 및 계정 삭제 요청을 제공한다. 사람 검색·메시지·공개 승격·오늘의 Instagram 노출은 이번 단계에서 제공하지 않는다.
- 관리자 mutation은 기존 인증 route 안에서 service-role로 수행하고 `admin_audit_logs`에 행위 유형과 대상 UUID를 기록한다. PHASE 10A 이후 공개 profiles SELECT가 제거된 상태에 맞춰 관리자 통계와 숨김 처리도 공개 Supabase 클라이언트 우회를 제거했다.
- 기존 공개 프로필·Production 데이터의 삭제, 기존 row 소유권 자동 부여, Production PHASE 10B migration 적용은 수행하지 않았다.

### 검증 상태

- 결정 문서와 FROZEN supersession note를 갱신했다.
- 관련 보안·RLS·API·관리자 회귀 테스트 5 files / 44 tests를 통과했다.
- 전체 테스트 77 files / 833 tests, TypeScript, Next.js 15.3.8 Production build(32 routes), `git diff --check`를 통과했다.
- PHASE 10B 상태: `LOCAL_VERIFIED`; Production 적용은 별도 승인 단계다.

### PHASE 10B-R 감사 보완

- 기존 `profiles`에 owner 상태와 visibility 기본값을 즉시 채우던 migration을 수정했다. 새 컬럼은 기존 row에서 NULL로 유지되고 기본값은 향후 쓰기에만 적용되므로 기존 개인정보 row를 재분류하거나 소유권과 연결하지 않는다.
- 신규 개인정보 테이블 6개에 `FORCE ROW LEVEL SECURITY`를 추가했다.
- 계정 탈퇴 요청과 private profile 상태 전환을 본인 전용 SECURITY DEFINER RPC 한 트랜잭션으로 묶었다. auth user 자체는 자동 삭제하지 않는다.
- 기존 관리자 profile/report moderation과 audit insert를 service-role 전용 명시적 action RPC 한 트랜잭션으로 묶었다. 삭제 요청에 포함된 client profile ID는 더 이상 신뢰하지 않고 report row 연결을 사용한다.
- 학교 level sync는 기존 동시성 재시도 알고리즘 때문에 route 단계에서 안전하게 되돌릴 수 없다. audit 실패를 500으로 반환하고 내부 school UUID만 포함한 수동 reconciliation 로그를 남기는 실패 보상 테스트를 추가했다.
- 로그아웃은 access/refresh session을 복원한 뒤 Supabase global sign-out을 요청하고, 성공 여부와 무관하게 로컬 httpOnly 쿠키를 제거한다.
- OTP 요청·검증은 서로 분리된 limit에 더해 IP와 정규화된 이메일의 SHA-256 key를 각각 사용한다. 원본 IP·이메일은 rate-limit key나 로그에 저장하지 않는다.
- 사용자에게 노출될 수 있던 성인 확인·OTP 오류 문구의 깨진 문자열을 정상 한국어로 수정했다.
- PHASE 10B-R 관련 감사 테스트 10 files / 84 tests, 전체 77 files / 836 tests, TypeScript, Production build(32 routes), `git diff --check`를 통과했다.

## 2026-07-28 (PHASE 10C-R 안전 연결 감사·격리 DB 검증)

### 감사 수정

- 사용자 pair를 정규화한 partial unique index로 반대 방향 동시 pending/accepted 요청도 DB에서 차단한다.
- opaque match token 원문 대신 SHA-256 hash만 저장하고, service-role RPC는 제출된 token을 hash해 잠금·만료·단일 사용을 검증한다.
- terminal request/connection 상태, 연결 pair와 accepted request 일치, 메시지 원문 불변, 메시지 sender와 Instagram grantor/grantee의 참가자 일치를 trigger로 강제한다.
- private membership 삭제는 request의 참조를 `SET NULL`로 정리하고 request 삭제는 연결과 하위 메시지를 cascade해 계정 삭제가 RESTRICT FK에 막히지 않게 했다.
- zero-width format 문자를 연락처 우회로 거부하고 본인 메시지를 신고 대상으로 제출하지 못하게 했으며 request/connection/message 단위 중복 신고 index를 추가했다.
- authenticated notification 직접 UPDATE grant를 제거했다. 알림 읽음은 검증된 session user를 사용하는 서버 service-role 경계에서만 처리한다.
- PHASE 10B profile 이름 입력도 NFKC 정규화해 exact match 입력과 저장 표현의 불필요한 차이를 줄였다.

### 격리 DB 검증

- Production과 분리된 `public.ecr.aws/supabase/postgres:17.6.1.143` 일회성 컨테이너를 사용했다.
- 최소 base schema 위에 PHASE 10A `20260728120000`, PHASE 10B `20260728150000`, PHASE 10C `20260728180000` migration을 순서대로 실제 적용했다.
- `TEST_A`, `TEST_B`, `TEST_C` 합성 UUID만 사용해 exact search, hashed opaque token, 정·역방향 중복 요청, 7일 전/후 재알림, 수락, 연결 전/후 메시지, 읽음, zero-width 필터, Instagram 승인/취소, 신고·차단·종료 후 메시지, transaction rollback, FK 사용자 삭제, anon/authenticated grant 경계를 검증했다.
- 첫 시도는 Supabase 이미지의 `auth` schema owner 차이로 bootstrap 전에 중단됐다. 두 번째 시도에서 SECURITY DEFINER의 빈 search_path 아래 unqualified `uuid_generate_v4()`가 실제 실패하는 결함을 발견해 `extensions.uuid_generate_v4()`로 수정했다. 세 번째 깨끗한 실행은 모든 assertion을 통과했다.
- Production row, 실제 이메일, 개인정보 원문, 실제 사용자 메시지는 사용하지 않았다.

### Production smoke hotfix

- PHASE 10C 첫 Production 배포 스모크에서 `/login`, `/account`, `/people/search`, `/connections`, `/notifications` 계열 metadata가 `noindex, nofollow, nocache`만 출력하고 승인 계약의 `noarchive`를 빠뜨린 것을 확인했다.
- 인증·RLS·개인정보 노출 결함은 아니지만 검색엔진 archive 금지 계약을 정확히 지키기 위해 모든 일반 사용자 private route에 `noarchive: true`를 추가하고 정적 회귀 테스트를 보강했다.
# 2026-07-28 — PHASE 10D Today Instagram MVP (LOCAL/DRAFT)

- 무료 편집 추천 `editorial_features`와 유료 `sponsored` 신청·자산·검수·수동 결제·배치·집계·신고·감사 테이블을 분리했다.
- 신청자는 PHASE 10B 로그인·KST 만 19세 이상·필수 동의 경계를 통과하고, Instagram 프로필 임시 코드의 SHA-256 hash를 운영자가 수동 검증한 뒤에만 신청할 수 있다.
- 자동 승인과 자동 PG는 구현하지 않았다. 결제 확인, 배치 예약, 활성화·중단·환불 상태 변경은 service-role 관리자 RPC와 감사 기록을 사용한다.
- 공개 카드는 승인된 자산과 결제 확인·활성 기간을 통과한 최소 필드만 렌더링하며 유료 항목은 `스폰서드`로 표시한다.
- 측정은 원시 IP·사용자 ID를 저장하지 않고 일자별 HMAC session hash로 중복을 제한한다. 광고주는 노출·클릭 집계만 보며 raw event row와 개인별 방문 목록은 볼 수 없다.
- PHASE 10D migration은 Production 미적용이며 PR은 Draft 상태까지만 진행한다. 자동 결제·영수증·세금계산서·쿠폰·반복 캠페인·Meta API는 PHASE 10E다.
- 격리 Supabase-compatible PostgreSQL에서 PHASE 10A→10B→10C→10D를 순차 적용하고 소유 확인·수정·취소·검수·수동 결제·KST 슬롯 충돌·활성화·중복 제거 지표·긴급 중단·계정 삭제 cascade·RLS/grant를 통과했다.

## 2026-07-28 — PHASE 10D-R 최종 감사 보강

- 광고 소재 수정 API도 최초 신청과 동일한 이미지 호스트 allowlist를 적용해 API와 DB 검증 계약을 일치시켰다.
- Instagram 소유권 확인 코드 재발급 때도 현재 만 19세 이상·필수 동의 상태를 다시 검증하도록 보강했다.
- 관련 테스트 4 files / 18 tests, 전체 87 files / 910 tests, TypeScript, Production build(43 pages), `git diff --check`를 통과했다.
- Production과 분리된 일회성 PostgreSQL에서 PHASE 10A→10B→10C→10D 순차 migration과 합성 사용자 전체 수명주기를 다시 통과했고 컨테이너를 제거했다.
- 최종 검증: TypeScript 통과, 87 files / 910 tests 통과, Production build 43 pages 통과, `git diff --check` 통과. 로컬 비로그인 `/promote`→`/login` 전환, private robots, API 401, 360/390/412 폭을 확인했다.

## 2026-07-28 — PHASE 10D Production 검증 hotfix

- PHASE 10D migration과 merge commit의 Production 배포 후 실제 정책 페이지에 남아 있던 시행 예정·적용 전 문구를 2026년 7월 28일 시행 및 현재 Production 운영 경계 문구로 정정했다.
- middleware가 인증 전 `/admin/login`으로 redirect할 때 최종 로그인 페이지에 robots metadata가 없던 공백을 보완해 `noindex`, `nofollow`, `nocache`, `noarchive`를 명시했다.
- DB migration, 환경변수, 프로모션 데이터, 기존 사용자·프로필 데이터는 변경하지 않았다.

## 2026-07-28 — PHASE 10D Production 최종 검증

- PR #27 hotfix를 squash merge한 뒤 Vercel Production merge commit 배포를 확인했다.
- `/advertising-policy`의 실제 시행일·현재 Production 운영 경계와 `/admin/login`의 `noindex`, `nofollow`, `nocache`, `noarchive`가 공식 도메인에서 반영됐음을 확인했다.
- PHASE 10D Production DB는 신규 promotion domain row 0건, 기존 공개 profile 25건과 기존 private/connection/message count 보존, anon/authenticated 직접 권한 0건, service-role table·RPC 권한 유지 상태다.
- 최종 상태: `PHASE_10D_PRODUCTION_APPLIED`.

## 2026-07-28 — PHASE 10E 프로모션 반복 운영 자동화

### 상품·견적·주문

- 관리자 상품 카탈로그에 placement, 기간, 이미지 규격, 문구 제한, 기본 가격, VAT 표시, 학교·지역 타기팅 허용, 판매 상태, 가격 정책 version과 catalog version을 추가했다.
- 승인된 신청에만 만료 견적을 발행하고, VAT 계산과 상품 설정을 quote/order snapshot으로 보존한다. 애플리케이션의 기존 고정 10,000원 승인 버튼은 제거했다.
- 광고주 견적 수락·거절과 단일 주문 생성, 주문번호, 결제 기한, append-only 상태 이력과 audit를 service-role RPC transaction으로 묶었다.

### 수동 결제·취소·환불

- `PaymentProvider` interface와 webhook을 항상 거부하는 `manual` adapter를 추가했다. 실제 계좌·카드·PG secret은 저장하지 않는다.
- 광고주 입금 완료 표시와 관리자 정확·부족·부분·초과 누적 확인, hash idempotency key, 중복 pending notice 방지를 추가했다.
- 취소 요청, 승인·거절, 환불 대기·부분·완료·불가를 분리하고 실제 외부 환불 후 관리자 확인만 상태에 반영하도록 했다.

### 일정·알림·보고

- KST placement/context 겹침을 advisory transaction lock과 시간 범위 충돌 검사로 차단하고 예약·활성·중단·재개·종료를 주문 상태와 함께 변경한다.
- 개인정보·금융정보 원문 없는 내부 알림 outbox에 idempotency, attempts, retry, safe error code를 추가했다.
- raw metric row 대신 기간·placement·학교/지역 context, 노출·클릭·CTR·일별 합계만 보존·제공하고 owner/admin 인증 CSV에 spreadsheet formula injection 방어를 적용했다.
- 광고주 대시보드와 관리자 상품·견적·입금 queue·취소/환불·캘린더·outbox·성과 운영 화면은 모두 private robots 계약을 사용하며 sitemap에 포함하지 않는다.

### 격리 DB 검증

- Supabase PostgreSQL 17.6.1 일회성 컨테이너에서 PHASE 10A→10B→10C→10D→10E migration을 순차 적용했다.
- 합성 성인 사용자만 사용해 상품 생성, 승인·견적, 타 광고주 접근 차단, 견적 수락·중복 주문 차단, 부분·누적 입금, KST 예약·활성, 집계 metric·보고, 종료, 취소·부분 환불·완료, 계정 삭제 cascade와 신규 10개 table RLS/FORCE RLS·grant를 검증했다.
- 집계 함수의 `day` SQL 별칭 충돌을 실제 실행에서 발견해 `metric_day`로 수정했고, 최종 깨끗한 실행은 `PHASE10E_ISOLATED_VERIFICATION_OK`를 반환했다. 일회성 컨테이너는 제거했다.
- PHASE 10E migration은 Production에 적용하지 않았다.

## 2026-07-29 — PHASE 10E migration history 정합성 복구

- Production 프로젝트 `ucnybhzpbatzcipwqtox`의 `public` schema를 data-free로 dump하고, PHASE 10F까지 로컬 migration을 적용한 격리 PostgreSQL schema와 대조했다.
- 컬럼·기본값·제약·index·policy 272개 정규화 정의의 차이가 0개였고, 관련 SECURITY DEFINER 함수 12개의 정의도 일치했다.
- 대상 10개 테이블의 RLS/FORCE RLS, 공개 역할 table grant 0개, service-role table grant 10개, 공개 역할 함수 실행 권한 0개, service-role 함수 실행 권한 12개를 확인했다.
- PHASE 10E schema가 실제 적용됐고 history만 누락된 조건을 충족한 뒤 Supabase CLI의 `migration repair --status applied`로 `20260728230000`을 기록했다. schema 변경, 데이터 mutation, 임의 history insert는 수행하지 않았다.
- 최종 상태: `PHASE_10E_MIGRATION_HISTORY_RECONCILED`.

## 2026-07-29 — PHASE 10G 결제 Provider Production 안전 적용

- PR #30 최종 감사에서 결제 검증·환불·provider 설정·접근 경계를 보강하고 관련 5 files / 19 tests, 전체 102 files / 968 tests, TypeScript, Production build 54 pages, 격리 DB lifecycle·권한, Chromium 및 모바일 E2E 4개를 통과했다.
- PR #30을 squash merge하고 merge commit `e76a3f67bce067bf55329ffbbeb14cf37b8816f4`를 Vercel Production에 배포했다.
- Production에는 `20260729130000_payment_provider_sandbox.sql`만 적용했다. 신규 결제 테이블 4개는 RLS/FORCE RLS, anon 직접 권한 0개, authenticated mutation 권한 0개, service-role 전체 권한을 유지한다.
- 결제 함수 9개는 모두 SECURITY DEFINER와 빈 search_path를 사용하고 anon/authenticated 실행 권한 0개, service-role 실행 권한 9개임을 확인했다.
- 적용 전후 기존 공개 프로필 25건과 private profile·connection·promotion·order·placement 0건이 동일했고, 신규 결제 테이블도 모두 0건이었다.
- 공식 도메인의 Home·Search·Submit, 로그인 경계, 관리자 결제 경계, private robots, 기존 연결·광고 경로를 확인했다. 공개 profile write는 503, 비인증 결제·관리자·health 경계는 401, webhook은 provider 미설정 503으로 닫혀 있다.
- Production Provider는 live 결제를 활성화하지 않은 `manual`/미설정 경계다. PortOne Production secret·webhook, 실제 결제·취소·환불·광고 주문은 생성하지 않았다.
- 최종 상태: `PHASE_10G_PRODUCTION_APPLIED_LIVE_PAYMENT_DISABLED`.

## 2026-07-29 — PHASE 10H 제한 출시·온보딩·성장 운영 (LOCAL/DRAFT)

### 구현

- 이메일 OTP 로그인 뒤 만 19세 이상 확인, 필수 동의, 해시 초대, 운영자 승인, 기본 비공개 본인 프로필, 과거 학교 이력, exact match 사람 찾기로 이어지는 `/onboarding` 흐름을 추가했다.
- 온보딩 진행 상태는 본인과 service role만 읽고, 단계 이벤트와 날짜별 funnel 집계는 service role만 접근한다. 신규 3개 테이블에 RLS/FORCE RLS를 적용했다.
- 성장 출처는 `direct`, `organic_social`, `creator`, `community`, `referral`, `paid_social`, `unknown`만 허용한다. 이메일·이름·Instagram·학교명·검색어·IP·referrer·raw UTM은 성장 데이터에 저장하지 않는다.
- 같은 사용자의 같은 단계는 최초 한 번만 집계하고, 기존 프로필·학교 이력·초대·사람 찾기·연결 요청 성공 경계에서 개인 원문 없는 운영 event만 증가시킨다.
- 관리자 운영 화면에는 현재 단계와 최근 14일 aggregate만 추가했다. 기존 관리자 인증, private SEO, live payment 비활성 경계를 유지한다.
- 최종 SQL 감사에서 프로그램 일시중지 또는 `people_search` 비상 차단 중에도 `ready`가 될 수 있는 문제를 찾아 `access_paused` fail-closed로 수정하고 격리 DB 회귀 검증을 추가했다.
- Supabase 이미지가 초기화 중 재시작하는 조건에서도 migration을 조기에 시작하지 않도록 일회성 DB 실행 스크립트를 container health와 실제 query 성공으로 확인하도록 보강했다.

### 검증

- 관련 테스트 4 files / 14 tests 통과.
- 전체 테스트 105 files / 978 tests 통과.
- TypeScript 통과.
- Next.js 15.3.8 Production build 통과: 55 static pages/routes.
- 일회성 Supabase PostgreSQL에서 전체 migration, 합성 사용자 온보딩 lifecycle, 단계 deduplication, coarse-source 고정, 프로그램 pause·기능 emergency disable fail-closed, maintenance idempotency, RLS/FORCE RLS와 grant를 통과했다.
- Chromium과 모바일 360/390/412에서 비로그인 온보딩 redirect, private robots, no-store API, 관리자 funnel 401, 가로 overflow를 확인했다: 8 tests 통과.
- 실제 사용자·Production row·결제·광고 주문·개인정보 원문을 사용하지 않았다.
- PHASE 10H migration은 Production에 적용하지 않았고 PR은 Draft 상태까지만 진행한다.

### PHASE 10H-R 최종 안전 감사

- 관리자 제한 출시 funnel의 단계·날짜·출처 세그먼트가 10명 미만일 때 정확한 count를 반환하던 문제를 수정했다. 응답과 UI는 `masked`와 `10명 미만`만 제공하고 개인 drill-down은 추가하지 않았다.
- `people_search` 비상 차단이 검색만 막고 새 안부·재알림·응답을 연쇄 차단하지 않던 경계를 서버 feature dependency와 DB INSERT trigger에서 모두 fail-closed로 보강했다.
- `messaging` 중단 시 기존 연결의 대화 GET·POST·읽음 PATCH도 차단했다. 신고·차단·연결 해제는 기능 중단 중에도 유지해 안전 조치를 막지 않는다.
- 같은 사용자가 같은 프로그램 초대를 다시 사용해 초대 use count를 소진할 수 있던 문제를 `ALREADY_REDEEMED` 멱등 차단으로 수정했다.
- service-role 초대 사용 RPC에서 사용자용 `has_current_adult_access()`의 `auth.uid()` NULL 결과가 PL/pgSQL `IF`를 통과할 수 있는 문제를 발견했다. RPC 내부에서 성인 확인과 필수 동의를 명시적 `EXISTS`/누락 검사로 다시 검증하고, 미확인 합성 사용자의 초대 사용이 membership mutation 없이 차단되는 회귀 검증을 추가했다.
- 여러 active 프로그램에서 첫 프로그램을 무조건 선택하던 온보딩을 사용자의 active/pending membership 프로그램 우선으로 수정했다.
- 본인 프로필과 본인이 졸업한 학교만 입력하고 타인의 정보를 등록하지 말라는 온보딩 안내를 추가했다.
- 합성 관리자·사용자 A/B·대기·거절 사용자를 이용해 다른 프로그램 초대, 만료·소진·중복 초대, 승인·거절, pause, people-search emergency disable, 단계 중복 방지, coarse source 고정, 최소 집계, audit와 실제 owner RLS를 격리 DB에서 통과했다. 모든 합성 row는 transaction rollback되고 컨테이너는 삭제됐다.
- PHASE 10A~10H 회귀 11 files / 70 tests, 관련 4 files / 18 tests, 전체 105 files / 982 tests, TypeScript, Production build 55 pages/routes, Chromium 및 모바일 360/390/412 E2E 8 tests를 통과했다.
## 2026-08-03 — PHASE 10N-A public account site completion (LOCAL/DRAFT)

- Started from clean `main`/`origin/main` commit `40776c514e8134daa5624fa500039f5bd334ac24`, PR #38 merged/closed, and frozen post-reset Production baseline `0/0/0/0/10006`; created `phase/10n-public-account-site-completion`.
- Audited the current OTP, access/refresh cookies, adult/consent, profile/membership, beta-coupled onboarding, account deletion, public navigation, administrator operations, and PHASE 10F/10J triggers before implementation.
- The audit found these release blockers: no separate public-account launch state; OTP always allowed user creation; no refresh rotation; an incomplete login screen; invite/beta-coupled onboarding and school writes; no administrator-completable deletion/tombstone flow; stale public copy and dormant feature links; and no public-account aggregate boundary. Verification then found and fixed an exact `/api/onboarding` middleware omission, a local GoTrue authenticated-role harness gap, stale/rate-limited OTP selection, deletion-request trigger ordering, and GoTrue's inability to parse an infinite `banned_until` value.
- Added `20260803120000_public_account_soft_launch.sql`. It starts closed, separates public account authority from controlled beta, preserves the active-beta single-school contract, permits at most three public-account histories, uses RLS/FORCE RLS and service-only audited mutations, and keeps people/connection/message/promotion/payment dormant.
- Added launch-controlled `shouldCreateUser`, generic OTP behavior, shared near-expiry server refresh/cookie rotation, idempotent adult and required-consent writes, normalized private profile input, no photo upload, safe school autocomplete/keyboard behavior, deletion-request write blocking, atomic administrator cleanup, and masked daily funnel counters with no person identifiers.
- Replaced beta invite/operator/people onboarding with the public six-step account journey and updated Home, `/submit`, login, `/account`, Header, TabBar, privacy/help links, mobile states, and operator launch/emergency/deletion section.
- Disposable DB evidence: `PHASE10N_LIFECYCLE_OK`, `PHASE10N_PERMISSION_OK`, `PHASE10J_LIFECYCLE_OK`, `PHASE10J_PERMISSIONS_OK`, final baseline `0|0|0|0|10006|0|0|closed`. Forced deletion failure rolled back profile, membership, request status, and audit together.
- Historical verification at the PHASE 10N-A head passed targeted Vitest `10 files / 43 tests`, full Vitest `113 files / 996 tests`, TypeScript, `git diff --check`, secret-pattern scan, and the Next.js 15.3.8 Production build with 58 generated pages/routes. That migration digest was superseded by PHASE 10N-B; the current canonical-LF SHA-256 is recorded in the hardening entry above.
- The real local-provider suite used disposable PostgreSQL, PostgREST, GoTrue, and Mailpit—not mocked route authentication—and passed `20/20`: Chromium `5/5`, mobile 360 `5/5`, mobile 390 `5/5`, and mobile 412 `5/5`, with `workers=1` and `retries=0`. It covered closed registration, synthetic existing-user OTP, cookies and refresh rotation, adult/consents, private profile, keyboard school selection, logout/relogin restore, profile/membership changes, emergency stop, deletion request/write block/atomic completion, completed-session rejection, public non-exposure, fixed legacy 503, and final `0|0|0|0|10006|0|0|0|0` data counts.
- Production migration/deployment/state/env/data, registration opening, real-person Auth/OTP/email, school selection, beta operation, promotion/payment, legacy data reuse, dependencies, lockfile, and environment files were not changed.

## 2026-08-10 — PHASE 10O-E social auth broker core (LOCAL / DRAFT / FEATURE OFF)

- Started from clean `main`/`origin/main` commit `7aa50a3023521c5b08c0ff35c399d1bce09e813a` with divergence `0/0` and created `codex/phase-10o-e-social-auth-broker-core`.
- Added `lib/auth/social-broker` as a server-only, route-free domain boundary independent of `lib/supabase.ts`. It contains no provider network client, access-token storage, database write, Supabase Auth write, runtime environment dependency, or Production credential.
- Implemented the exact opaque subject contract, independent one-time state/nonce digest bindings, S256-only PKCE, immutable-provider/terminal login attempts, fake Kakao/Naver/Google adapters, and an ephemeral in-memory RSA test-key RS256 OIDC harness with opaque Access Token and downstream Supabase-facing nonce contracts.
- Added threat-model tests for CSRF/state substitution, mix-up/provider substitution, PKCE downgrade and mismatch, nonce mismatch, callback and authorization-code replay, attempt/code expiry, client and redirect binding, namespace/key-version separation, terminal reuse, concurrent consume, malformed upstream responses, and sensitive-log leakage.
- Frozen the no-email-linking policy, Auth-email-NULL direction, immutable primary provider, separate recovery-email OTP boundary, and outer-ASCII-whitespace-trimmed/exact-local-part-preserving/domain-only-IDNA canonicalization in `docs/decisions/2026-08-10-social-auth-broker-contract.md`.
- Kept `/login`, existing email OTP, middleware, account/onboarding/profile/membership, launch state, Production, migrations, environment, provider dashboards, real OAuth, real email, Auth users, and PASS unchanged.
## 2026-08-10 — PHASE 10O-G attempt-first orchestration (LOCAL / DRAFT)

- Added forward migration `20260810182000_social_login_attempt_decision_boundary.sql` and server-only attempt-decision contracts. The applied PHASE 10O-F migration is unchanged.
- New/cross-provider flows are recovery-first; existing-primary login stays recovery-free; recovery match returns only the primary provider and does not link providers.
- Production, Auth users/configuration, provider calls, email/OTP, login UI, middleware, launch state, and environment remain unchanged.
## 2026-08-11 — PHASE 10O-J durable broker authorization-code boundary (LOCAL / DRAFT / FEATURE OFF)

- Added `20260811220000_broker_authorization_code_boundary.sql` without changing any Production-applied migration. The new private code ledger uses RLS/FORCE RLS and no direct table grants; only service-role issue/consume RPCs are executable.
- Prepared raw 256-bit opaque codes in a `server-only` helper and persist only a domain-separated SHA-256 digest. Codes bind exact S256 PKCE challenge, client ID, redirect URI, durable attempt, and a maximum 60-second TTL; failed exchange transitions persist terminal states and replay is safe.
- Added separate injected-key AES-256-GCM protection for a downstream authorization nonce, with AAD bound to code UUID/client/redirect/key version. The helper returns raw code separately from DB payload; raw nonce/code/verifier are not DB columns or logs.
- Fresh disposable PostgreSQL replays the complete 10O-F/G/H/I/J migration chain and validates lifecycle, permission, independent-process consume race, and Node→DB→Node nonce crypto. No Production migration/write, environment change, provider/email call, external Auth user, route, UI, or launch-state mutation occurred.
- Draft-review follow-up made DB time authoritative for `authentication_time`: negative and future values are rejected before any issue-side write or state transition. Known-code expiry now terminalizes both durable code and attempt as `expired`; client/redirect/PKCE failures terminalize code as `rejected` and attempt as `failed_safe`; replay never restores either state. Code rows now set `created_at` from the same issue clock used for the 60-second expiry calculation, preventing a near-expiry check-constraint leak.
## 2026-08-14 — PHASE 10O-S durable continuation recovery (LOCAL / DRAFT)

- Q's isolated crash audit established that the destructive O claim sequence could strand `claimed` and `upstream_bound` rows after process loss. S intentionally does not patch Q or rewrite M/N/O/P/R.
- S adds retry-safe pre-callback continuation authority and AEAD-protected canonical upstream state/nonce reconstruction. Callback claim removes that authority; an explicit service-only expiry RPC terminalizes abandoned pending/callback-claimed shapes and scrubs all durable context.
- Fresh isolated DB acceptance currently covers resolver crash retry, response-loss resume, wrong-binding rejection, expiry cleanup, callback-claimed cleanup, grants, R terminal scrub, and independent direct-TCP continuation/expiry races. Cleanup scheduling remains a prerequisite before public activation.
- The initial J chained-harness timeout was not reproduced after Docker recovery: pristine baseline and S each passed the original J runner three times, with no semantic assertion failure. S also passed the J/M/N/O/P/R chained regressions, targeted S tests (2/2), full Vitest (1,140 passed / 4 skipped), TypeScript, and a non-production synthetic production-mode build.
- Route acceptance is exact frozen-baseline set parity, not a new absolute count: baseline `99efcd22c3d048a2eb545f3811069fba62291821` and S each have 95 canonical public routes, with added/removed sets both empty. The historical `58 pages/routes` metric remains as a historical record but is not reproducible on the frozen baseline.
- Pre-merge hardening adds `private.downstream_auth_tx_continuation_digest_live_key`, a partial unique index on non-null `continuation_handle_digest`. Lifecycle and independent direct-TCP races prove exactly one live authority, coarse collision behavior, legitimate authority survival/resume, zero deadlocks, and zero raw constraint leakage. Updated S migration LF SHA-256: `2D30992AA0813D9DBE9DE45B93D36C498E244B2448E14FFE9A329A2F71773AB0`.
