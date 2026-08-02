# PHASE 10J — First controlled beta safety plan

Status: `PHASE_10J_PRODUCTION_APPLIED_AND_MERGED_NO_BETA_DATA`

This document preserves the PHASE 10J-A preflight findings and the PHASE 10J-B implementation decision. Migration `20260730100000_first_controlled_beta_safety_boundaries.sql` was later applied to Production, PR #35 was squash-merged, and merge commit `d8ab78a308dae7e796eb16601303e4b392fcee93` was deployed. No real beta Draft, snapshot, allowlist, program, flag, readiness, invite, or member was created.

The final PHASE 10J state is `PHASE_10J_PRODUCTION_APPLIED_AND_MERGED_NO_BETA_DATA`. Actual school selection, paused-program preparation, active transition, invitation, and user-facing beta operations remain separate approvals.

## Purpose

PHASE 10J prepares the first real, adult-only controlled beta. PHASE 10J-A determines whether the existing Production state and administrator surfaces can enforce the intended contract without operator convention or mutable descriptive text.

The audit found that draft validation and atomic paused-program creation are implemented, but the first beta must not start yet. There is no administrator-only atomic `paused` to `active` transition boundary, and the target school is not enforced as a database contract. PHASE 10J-B must close these boundaries before a real program, activation, or invite is approved.

## Historical PHASE 10J-A audited baseline

- Git baseline: local `main` and `origin/main` both at `5215ec7a85653500fe312e01640d13f5ce3f4a0f`; working tree clean before this documentation branch was created.
- Production migration history is ordered through `20260729190000`.
- All 8 PHASE 10I operation tables exist in Production with RLS/FORCE RLS enabled.
- Existing public data remained unchanged during the audit: 25 public profiles and 10,006 schools.
- Existing connection requests, messages, Instagram permissions, promotion requests, commercial orders, and payment transactions remained unchanged at 0 rows.
- No setup draft, setup snapshot, invite, or member was created by this audit.
- No personal name, email, message, Instagram identifier, search text, token, or IP address was read or recorded.

## Recommended operating contract

| Contract field | Required value |
| --- | --- |
| Maximum members | 20 |
| Duration | Exactly 14 days, with explicit `starts_at` and `ends_at` |
| Target schools | Exactly 1 school |
| Target school | `TARGET_SCHOOL_PENDING_OPERATOR_DECISION` |
| Eligibility | Operator-verified graduates who are at least 19 years old |
| Uses per invite | 1 |
| Invite expiry | 7 days |
| Administrator approval waitlist | Enabled |
| Initially allowed features | `account_registration`, `private_profile` |
| Initially disallowed features | `people_search`, `connection_request`, `messaging`, `instagram_permission`, `promotion_application`, `promotion_operations` |
| Mandatory stop conditions | `PRIVACY_EXPOSURE`, `RLS_FAILURE`, `HEALTH_FAILURE` |

The target school must be chosen by the operator. A school name in free text is not an authorization boundary and must not be used as one.

## Existing Production program

### Observed state

| Field | Read-only result |
| --- | --- |
| Program key | `limited_beta_2026` |
| Creation purpose | PHASE 10F operational-readiness seed |
| Status | `active` |
| Emergency disabled | No |
| Starts at | 2026-07-29 12:46:25 KST |
| Ends at | Not set |
| Invites | 0 |
| Members | 0 |
| Setup snapshots | 0 |
| Program-scoped feature flags | 0 |
| Campaigns | 0 |

Production also contains 8 global feature flags. Every flag is enabled with the PHASE 10F default reason. The flags cover `account_registration`, `private_profile`, `people_search`, `connection_request`, `messaging`, `instagram_permission`, `promotion_application`, and `promotion_operations`.

### Reuse decision

`NEW_PROGRAM_RECOMMENDED`

The existing program predates immutable PHASE 10I setup snapshots, has no end time, is already `active`, and inherits all 8 globally enabled features. It has no invites or members, but editing it to resemble the PHASE 10J contract would erase the distinction between an earlier operational-readiness seed and the first real controlled beta. It must not be modified or reused.

After PHASE 10J-B and an explicit operator school decision, create a new snapshot-backed program that starts `paused`. The existing program should remain unchanged until a separately approved legacy-state disposition is designed.

## Current execution-path support

| Step | Implementation | Operator surface | Production approval | Audit result |
| --- | --- | --- | --- | --- |
| 1. Save Draft | Implemented | Administrator UI, API, service-role RPC | Required because it creates Production data | Supported after blockers are fixed |
| 2. Validate Draft | Implemented in app and DB | Administrator UI, API, service-role RPC | Required because it mutates the Draft | Supported after blockers are fixed |
| 3. Create paused program | Implemented atomically with snapshot and audit log | Administrator UI, API, service-role RPC | Required | Mechanism works, but do not create until school binding exists |
| 4. Confirm immutable snapshot | Implemented and immutable in DB | Administrator UI shows existence/count; API returns contract fields | Read-only confirmation does not need mutation approval | UI review is partial; DB contract is implemented |
| 5. Set program feature flags | RPC/API capability exists | Generic operations API; current UI toggles only global flags | Required | Program-scoped operator workflow is incomplete |
| 6. Transition to active | Not implemented | No UI, API action, or dedicated RPC | Separate explicit approval required | **BLOCKER** |
| 7. Create hashed invite | Implemented | Administrator operations UI/API/RPC | Separate explicit approval required | Unsafe contract: RPC accepts `paused` and snapshotless programs |
| 8. Redeem invite | Implemented | Authenticated onboarding API/RPC | Requires approved active beta | Checks active/time/adult/consent/capacity, but not target school |
| 9. Approve member | Implemented with capacity enforcement when a snapshot exists | Administrator beta and operations UI/API/RPC | Separate approval required | Missing target-school and complete program-state contract |
| 10. Inspect onboarding progress | Implemented with minimum-data and aggregate views | Administrator UI/API | Read-only access only | Supported; small segments remain masked |
| 11. Emergency stop | Implemented with audit log | Administrator UI/API/RPC | Emergency action may be taken under the approved incident procedure | Stop works; restore does not rerun activation readiness |
| 12. Generate daily report | Implemented as on-demand JSON/CSV aggregate | Administrator UI/API | Read-only access only | Supported; it does not create a public report |

## Activation-boundary audit

- `admin_activate_beta_setup()` is correctly named for setup activation but only creates a `paused` program, immutable snapshot, and audit log. It does not transition a program to `active`.
- No administrator action or service-role RPC dedicated to `paused` to `active` exists.
- Consequently, no atomic boundary requires a snapshot, exact 14-day window, capacity, mandatory stop conditions, selected school, or approved effective feature set immediately before active status.
- `admin_set_beta_feature()` rejects a program-scoped feature outside an existing snapshot allowlist, but the current operations UI manages global flags rather than a selected program's complete flag set.
- `admin_set_beta_emergency()` can explicitly clear an emergency timestamp without rerunning readiness or activation checks. It does not itself change program status, but a restored legacy active program resumes access immediately.
- `admin_issue_beta_invite()` allows both `paused` and `active` programs and treats a missing snapshot as a legacy-compatible path.
- `redeem_beta_invite()` correctly requires an active, in-window, non-emergency program and adult consent, but it cannot compensate for the missing target-school contract.

Verdict: the activation boundary is not sufficient for a real beta.

## Target-school boundary audit

- `beta_setup_drafts.target_scope` and `beta_program_setup_snapshots.target_scope` are descriptive text.
- The immutable snapshot has no `school_id` and there is no program-school allowlist table.
- `beta_campaigns.school_id` is nullable campaign metadata. It is not referenced by invite redemption, member approval, feature access, account registration, or school-membership creation as an authorization boundary.
- The current first-school administrator view creates campaign records without selecting a school ID.
- Account school history accepts a school ID independently of a beta program's intended target because no program-school relationship exists.

Verdict: use a dedicated `beta_program_schools` allowlist keyed by `program_id` and `school_id`, copied atomically from a validated setup school selection. For the first beta, enforce exactly one row. The allowlist must be checked at activation, invite redemption/member approval as appropriate, and before creating or changing beta-scoped school history. A campaign's optional school ID must remain reporting metadata, not the authorization source.

## BLOCKER

### J-B1 — Atomic active transition is absent

- File/DB objects: `lib/policy/betaOperations.ts`, `lib/betaOperations.ts`, administrator beta API/UI, `public.beta_programs`, new service-role RPC.
- Current behavior: setup activation stops at `paused`; no guarded path can make the new program active.
- Risk: a direct or future generic status update could bypass snapshot, time-window, capacity, stop-condition, school, feature, emergency, and audit checks.
- Required change: add one idempotent administrator-only `paused` to `active` RPC and corresponding API/UI action. In one transaction it must lock the program, require exactly one immutable snapshot and one allowed school, require max 20 and a valid 14-day window, verify all mandatory stops, verify the effective feature set is exactly the approved initial set, reject emergency-disabled or legacy programs, and append an audit log. Reactivation after emergency stop must use a distinct explicit approval path and repeat all checks.
- Test: lifecycle, idempotency, concurrent activation, missing/duplicate snapshot, missing/multiple school, wrong dates/capacity/stops/features, emergency restore, anon/authenticated denial, service-role success, and atomic rollback tests.

### J-B2 — Target school is not an enforceable contract

- File/DB objects: `beta_setup_drafts`, `beta_program_setup_snapshots`, proposed `beta_program_schools`, setup UI/schema/RPC, account school-membership API/RPC.
- Current behavior: the target is free text; campaign `school_id` is nullable and informational.
- Risk: a member can add a different school history and enter people-discovery or later features outside the approved one-school beta.
- Required change: add a validated school UUID to Draft setup and atomically create an immutable program-school allowlist. Enforce one school for this program at DB boundaries used by activation, member onboarding, private profile school history, and every later school-scoped feature.
- Test: valid selected school, missing/unknown/different school rejection, second-school rejection, immutable allowlist, concurrent writes, legacy program isolation, RLS/grant denial, and service-role administrator success.

## REQUIRED BEFORE ACTIVE

### J-B3 — Effective feature state must be activation input

- File/DB objects: `admin_set_beta_feature`, `has_beta_feature_access`, operations UI/API, new activation RPC.
- Current behavior: a snapshot limits allowed features, but program flags are not materialized by setup activation and the UI primarily edits global flags.
- Risk: operator intent is split between immutable allowed features and mutable global fallback state.
- Required change: present program-scoped flags only for the selected snapshot-backed program and make activation verify the exact initial effective set: `account_registration` and `private_profile` on, all other features off.
- Test: global true flags cannot widen a snapshot; extra/missing program feature state rejects activation; activation creates no unrelated public flag.

### J-B4 — Emergency recovery must not resume an active program by one generic click

- File/DB objects: `admin_set_beta_emergency`, operations policy/UI, new activation/readiness boundary.
- Current behavior: clearing `emergency_disabled_at` on an already active program immediately restores effective access.
- Risk: post-incident readiness, stop conditions, and operator approval are not rechecked.
- Required change: make restoration leave the program non-active or require a separate audited reactivation RPC that repeats every activation check and records a new operator decision.
- Test: emergency stop blocks access; generic restore cannot resume access; reactivation without fresh readiness fails; approved reactivation is atomic and audited.

## REQUIRED BEFORE INVITE

### J-B5 — Invite issuance accepts paused and snapshotless programs

- File/DB objects: `admin_issue_beta_invite`, `lib/operations.ts`, operations UI/API.
- Current behavior: the RPC accepts status `paused` or `active`; snapshot rules are conditional when a snapshot happens to exist.
- Risk: an operator can issue an invite for the legacy program or before active approval, and the token may become usable later under an unintended contract.
- Required change: require an active, in-window, non-emergency, snapshot-backed, one-school program. Enforce one use and a maximum 7-day expiry from the immutable snapshot. The UI must list only eligible programs and show the selected school without exposing personal data.
- Test: paused, legacy, expired, emergency, missing-school, max-use, expiry, revoked, and concurrent issuance failures; valid service-role issuance; anon/authenticated denial.

### J-B6 — Member approval must recheck the complete program contract

- File/DB objects: `admin_review_beta_member`, member administration UI/API.
- Current behavior: snapshot capacity is rechecked, but program active/time/emergency/school eligibility is not a complete approval predicate.
- Risk: a pending member may be activated after the program or school contract is no longer valid.
- Required change: before `active` membership, lock and recheck active status, dates, emergency state, snapshot, capacity, one-school allowlist, adult/consent state, and member school eligibility; audit the decision atomically.
- Test: each missing prerequisite rejects without partial mutation; capacity race is rejected; a valid approval succeeds once.

## OPERATIONAL

- The operator must choose exactly one school and verify it by immutable school ID before any Production Draft is created.
- The operator must independently confirm every invite recipient is a graduate and at least 19 years old. Do not store verification notes containing names, emails, or social identifiers in beta operator text fields.
- Use a unique program key and exact KST start/end timestamps; do not reuse `limited_beta_2026`.
- Keep invitation delivery manual and single-recipient. Never bulk-send, auto-retry, or expose the token in logs.
- Review the masked daily report and health/RLS/privacy signals at the same time each day.
- Treat any mandatory stop signal as a stop-first event. Do not delete evidence or existing user data as a rollback technique.

## PHASE 10J-B implementation scope

1. Add an immutable one-school allowlist and validated school selection to the setup contract through a new migration.
2. Add an administrator-only, idempotent, atomic activation/reactivation RPC with snapshot, school, time, capacity, stop-condition, feature, emergency, and audit enforcement.
3. Restrict invite issuance to active snapshot-backed programs and enforce the immutable one-use/seven-day policy.
4. Recheck the full contract during member approval and beta-scoped school-history writes.
5. Add program-scoped feature controls and eligible-program filtering to administrator UI/API surfaces.
6. Add isolated PostgreSQL lifecycle/RLS/grant tests, application policy/route tests, and desktop/mobile administrator E2E for all rejection and success paths.

PHASE 10J-B must not mutate the existing legacy program, assign ownership, create a real program/invite/member, or apply its migration to Production without separate approval.

## Real-start approval gates

All gates must pass before any Production mutation:

1. PHASE 10J-B code, migration, RLS/grants, and tests are reviewed and separately approved for Production.
2. The operator selects one school ID; status remains `TARGET_SCHOOL_PENDING_OPERATOR_DECISION` until then.
3. A new Draft exactly matches the recommended contract and passes application and DB validation.
4. The created program is `paused`; its immutable snapshot and one-school allowlist are independently verified.
5. Effective features are exactly the two allowed initial features.
6. A separate explicit approval authorizes active transition.
7. A second explicit checkpoint authorizes the first single-use invite only after active-state verification.

## Stop and rollback criteria

- Immediately stop on `PRIVACY_EXPOSURE`, `RLS_FAILURE`, or `HEALTH_FAILURE`.
- Also stop on adult-eligibility bypass, out-of-scope school acceptance, unmasked small-segment data, unexpected feature access, or invite-policy bypass.
- Emergency stop must disable access and prevent new invite use. Revoke outstanding invites when the incident scope requires it and suspend affected membership access without deleting evidence.
- Do not roll back by deleting existing profiles, changing ownership, editing the immutable snapshot, or rewriting audit logs.
- Resume only through a separate approved reactivation path after corrective verification.

## Data minimization

- Administrator views and reports use opaque references and aggregate counts.
- Fewer than 10 users in a segment remains masked.
- Names, raw email addresses, Instagram identifiers, message bodies, search terms, IP addresses, cookies, and invite tokens are excluded from reports and audit documentation.
- Target-school enforcement uses a school UUID, not a person's information and not a free-text school name.

## Explicitly not executed

- No Production DB write, migration, schema repair, or data mutation.
- No program, Draft, snapshot, school allowlist, feature flag, invite, member, campaign, or readiness row created or changed.
- No active transition, emergency-state change, OTP, message, Instagram permission, promotion, order, payment, or advertisement.
- No Vercel deployment, setting, environment-variable, or secret change.
- No existing public profile, school, connection, message, advertising, order, or payment row changed.

## Historical PHASE 10J-A decision

`PHASE_10J_PREFLIGHT_BLOCKED_IMPLEMENTATION_REQUIRED`

The current state supports read-only operations and several paused-program preparation steps, but it is not safe to create or start the first real beta until PHASE 10J-B implements the atomic active transition and enforceable one-school contract.

## PHASE 10J-B implementation result

The blockers identified above are implemented and locally verified in migration `20260730100000_first_controlled_beta_safety_boundaries.sql`:

- the selected school is a validated UUID copied atomically into the immutable setup snapshot and a one-row `beta_program_schools` allowlist;
- the first-beta contract is fixed at 20 members, exactly 14 days, one use per invite, at most seven days per invite, administrator approval, all three mandatory stops, and only `account_registration` plus `private_profile`;
- a service-role-only, idempotent start RPC is the only supported transition from the newly created `paused` program to `active`;
- program-scoped flags must contain all eight keys with exactly the two approved keys enabled, so legacy global flags cannot widen a snapshot-backed program;
- invite issue, redemption, approval, capacity, and private school-history writes recheck the immutable contract at DB boundaries;
- emergency stop pauses access and generic restore fails closed; a separately approved reactivation requires a post-stop readiness record and a complete contract recheck.

Application tests, the full suite, TypeScript, Production build, isolated PostgreSQL lifecycle/RLS/grants, and Chromium/mobile E2E passed before merge. Production migration, non-destructive database verification, PR merge, Vercel deployment, and public smoke verification subsequently passed.

No target-school decision, actual Draft or program, active transition, invite, member enrollment, or user-facing beta operation was performed. Current status: `PHASE_10J_PRODUCTION_APPLIED_AND_MERGED_NO_BETA_DATA`.
