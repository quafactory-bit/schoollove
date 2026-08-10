# Public account soft-launch runbook

PR #39 application deployment and migration `20260803120000_public_account_soft_launch.sql` are complete. Production is frozen at `closed` with all three public account features false and launch-created Auth/profile/membership rows at zero. This runbook does not authorize another deployment or migration, an environment or state change, Auth user/OTP, registration opening, school selection, beta operation, or personal-data write.

## 1. Post-reset baseline

Read-only verify the deployed commit, `profiles/reports/traces/search_logs = 0/0/0/0`, `schools = 10,006`, new private/account/connection data 0, actual beta operational rows 0, scoped beta flags 0, commercial rows 0, target school `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`, legacy fixed 503 APIs, public person non-exposure, and healthy runtime logs.

## 2. Applied migration baseline

Migration `20260803120000` is applied exactly once. Its canonical-LF SHA-256 remains `5DF7F3E489D91C18328524C0AA1ACA3F10276F0700604FD27433F68228854A48`; postflight is 71 public tables and launch `closed`. Future read-only checks must stop on migration-history, file, table, grant, RLS, or baseline drift. Never repair history or edit this applied migration.

## 3. Application deployment baseline

The reviewed PR #39 merge commit `48f693bc0625c4dabfcb9c974c364292877349b6` is the applied Production application baseline. Confirm legacy writes remain fixed closed and public pages remain healthy. PHASE 10N-E permits only an automatic Draft Preview; do not merge or deploy it to Production without separate approval.

## 4. Future migration rule

Any future migration requires separate explicit approval, request drain, read-only activity evidence, and a new forward-only file. Do not reapply, modify, or repair `20260803120000`. Migration work is outside PHASE 10N-E.

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

## 13. Current evidence

PHASE 10N-E locally reproduced the GoTrue warning at school-autocomplete activation, corrected the duplicate browser-client lifecycle, and verified a fresh autocomplete context with zero warning/error plus stable repeated HMR. Its targeted Vitest passed `6 files / 40 tests`, full Vitest `115 files / 1,012 tests`, TypeScript, and the 58-page/route build. `npm run lint` remains blocked by the repository's pre-existing interactive ESLint setup. Automatic Draft Preview deployment succeeded, and the authenticated Preview browser passed autocomplete and School Hub with Warning/Error/GoTrue warning 0. Fresh Playwright mobile contexts were redirected to Vercel protection login instead of the app, so direct 360/390/412 app viewport evidence remains blocked. Do not read or transfer browser session data, change protection settings, or claim the protected login screen as application verification. None of this evidence authorizes another Production migration, deployment, state change, Auth creation, or open.

The modified-head disposable provider matrix passed Chromium/mobile 360/mobile 390/mobile 412 at `5/5` each (`20/20`, workers 1, retries 0), including forced provider failure → `failed_safe` → successful retry, controlled-beta closed/open/emergency regression, and final baseline `0|0|0|0|10006|0|0|0|0`. Targeted Vitest passed `8 files / 54 tests`, full Vitest `114 files / 1,008 tests`, TypeScript and the 58-page/route build passed, and the isolated suite passed all 18 rollback scenarios plus PHASE 10J/10N lifecycle/permission checks. Canonical-LF migration SHA-256: `5DF7F3E489D91C18328524C0AA1ACA3F10276F0700604FD27433F68228854A48`. This is local/Preview-preparation evidence only and does not authorize Production migration, deployment, state change, Auth creation, or open.
