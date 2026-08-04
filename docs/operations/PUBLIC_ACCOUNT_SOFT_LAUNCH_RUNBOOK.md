# Public account soft-launch runbook

This runbook is preparation only. No step authorizes Production migration, deployment, environment change, Auth user/OTP, registration opening, school selection, beta operation, or personal-data write.

## 1. Post-reset baseline

Read-only verify the deployed commit, `profiles/reports/traces/search_logs = 0/0/0/0`, `schools = 10,006`, new private/account/connection data 0, actual beta operational rows 0, scoped beta flags 0, commercial rows 0, target school `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`, legacy fixed 503 APIs, public person non-exposure, and healthy runtime logs.

## 2. Migration dry-run

Pin the approved Supabase CLI. Confirm the only pending version is `20260803120000`, recompute canonical-LF SHA-256, inspect the forward-only file, and run dry-run. The migration itself must accept exactly 68 preflight tables, the frozen UUID person-link catalog, legacy `0/0/0/0`, schools 10,006, one legacy beta program, eight global flags, and zero person/beta-operation/scoped/commercial drift before any permanent DDL; postflight must report 71 tables and closed state. Stop on any additional pending migration, applied-file drift, table/grant/RLS drift, or baseline mismatch. Do not repair history or push in this step.

## 3. Application deployment

After separate merge/deployment approval, deploy the exact reviewed merge commit first. Confirm legacy writes remain fixed closed, public pages are healthy, account launch safely falls back closed while the new RPC is unavailable, and no older deployment serves the official domain. Do not manually redeploy unless separately approved.

## 4. Production migration

Requires a separate explicit approval. Drain requests, capture read-only `pg_stat_activity`, execute the single reviewed migration once, and verify history exactly once. The migration must create the control singleton in `closed`; applying it must not create an Auth user, account/profile/membership row, beta row, or commercial row.

## 5. Closed-state verification

Confirm safe state RPC reports `closed` with all features false; PUBLIC/anon/authenticated cannot mutate control/audit/funnel; authenticated cannot directly INSERT consent/deletion/profile/membership or UPDATE profile/membership; only reviewed owner RPCs remain executable; existing users receive generic OTP behavior with `shouldCreateUser=false`; nonexistent emails are not disclosed; Home and `/submit` show preparation copy; legacy counts stay zero; schools stay 10,006.

## 6. Internal test

Requires separate Production test approval and a preapproved synthetic account. Never create or use a real-person fixture. Move `closed → internal_test` with a safe reason code; registration remains false. Verify real provider OTP, cookie rotation, expired-access refresh, adult self-attestation, four consents, private profile, up to three school histories, logout/login restore, update/delete, deletion-request block, no public exposure, no raw logs, and masked aggregates. Return to `closed` after evidence capture unless continuing is explicitly approved.

## 7. Readiness

Verify reviewed commit, migration version and SHA, health, current RLS/grants, rate-limit fail-closed behavior, Auth/SMTP delivery, browser matrix, support/contact coverage, deletion operator availability, runtime logs, Preview and isolated DB evidence, baseline counts, and no beta/commercial activation. Record the immutable readiness only with an affirmative operator decision and an empty blocker list. `ready` still keeps all three features false.

## 8. Separate open approval

`ready → open` uses the separate open RPC and requires the latest blocker-free readiness created within 24 hours, exact commit/migration equality, and a new explicit reason naming operator approval. Generic state mutation cannot select `ready` or `open`. Never combine migration and open into one action. Verify `account_registration`, `private_profile`, and `school_membership` are the only enabled public features.

## 9. Low-volume launch

Monitor Home/login/actual-search request activity separately from first-account OTP/adult/consent/profile/school/onboarding/deletion milestones, with aggregates below 10 masked. These are not unique visitor counts, and `return_session` is not collected. Inspect Warning/Error/Fatal and unintended 5xx without copying request bodies, emails, tokens, or user content. Confirm public person exposure, connections, messages, Instagram permission, promotion, and payment remain closed.

## 10. Emergency stop

On privacy exposure, RLS/grant failure, unexpected Auth user creation, personal logging, deletion partial success, uncontrolled 5xx, or out-of-contract feature access, invoke the service-only transition to `emergency_stopped` first. Confirm all three public features are false and eligibility, consent, profile, membership, and onboarding writes stop for both public and active controlled-beta accounts. Verify UI disabling and direct API/RPC denial separately. Owner privacy deletion and account-deletion requests remain governed by their dedicated rights-preserving paths. Preserve non-personal evidence.

## 11. Recovery and forward correction

Do not restore the prior state. After correction, move only to `closed`, repeat internal test, create a fresh immutable readiness, and obtain a separate open approval. A magic reason string cannot reopen the service. Prefer a forward migration. Do not edit applied migrations, delete audit/history, manually change rows, or weaken controlled-beta contracts.

## 12. Two-phase deletion operator

For a pending or `failed_safe` request, invoke the reviewed admin endpoint once. It first runs the database preparation transaction, which deletes public account data, blocks the Auth identity, and records `public_data_deleted`. A separate service-only handoff changes the request to `auth_deletion_pending` and yields the linked identity only to the server. The server then hard-deletes that identity through the Auth Admin API and finalizes only after the request foreign key is null. Provider failure must leave `failed_safe`, must not be reported as complete, and is retried through the same operator path. Never manually set `done`. Deidentified request and minimal audit rows carry a 90-day purge deadline; execute the service-only purge procedure through separately scheduled operational approval.

## 13. Current local evidence

The modified-head disposable provider matrix passed Chromium/mobile 360/mobile 390/mobile 412 at `5/5` each (`20/20`, workers 1, retries 0), including forced provider failure → `failed_safe` → successful retry, controlled-beta closed/open/emergency regression, and final baseline `0|0|0|0|10006|0|0|0|0`. Targeted Vitest passed `8 files / 54 tests`, full Vitest `114 files / 1,008 tests`, TypeScript and the 58-page/route build passed, and the isolated suite passed all 18 rollback scenarios plus PHASE 10J/10N lifecycle/permission checks. Canonical-LF migration SHA-256: `5DF7F3E489D91C18328524C0AA1ACA3F10276F0700604FD27433F68228854A48`. This is local/Preview-preparation evidence only and does not authorize Production migration, deployment, state change, Auth creation, or open.
