# PHASE 10K — Limited beta readiness audit

Status: `PHASE_10K_LIMITED_BETA_READINESS_AUDITED_NO_PRODUCTION_WRITES`

## Scope and baseline

This is a documentation-only readiness audit. It does not select a school or create, activate, invite, enroll, message, advertise, charge, migrate, deploy, or change Production data.

- Local `main` and `origin/main`: `d8ab78a308dae7e796eb16601303e4b392fcee93`
- PR #35: merged and closed
- PHASE 10J migration: `20260730100000_first_controlled_beta_safety_boundaries.sql`, applied
- Vercel Production: deployed successfully before this audit
- PHASE 10J final state: `PHASE_10J_PRODUCTION_APPLIED_AND_MERGED_NO_BETA_DATA`
- Actual beta school: `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`
- New Production beta Draft, snapshot, allowlist, program, program flag, readiness, invite, or member created by PHASE 10J/10K: 0

## Vercel runtime-log access

### Minimum safe access

- Prefer the project dashboard's Logs page with an existing authenticated team/project account that already has observability/log permission. Project or team ownership is not required when a narrower role with log access exists.
- A Pro Viewer cannot view observability/log data. Where project-level RBAC is available, use the narrowest project role that explicitly permits logs; do not grant deployment, environment-variable, billing, or team-administration access merely for monitoring.
- CLI use is secondary and only acceptable when the workstation is already authenticated and linked to the correct project/scope. Do not mint a token for this audit, pass a token on the command line, or copy credentials into reports.
- Official references: [Runtime Logs](https://vercel.com/docs/logs/runtime), [Access Roles](https://vercel.com/docs/rbac/access-roles), and [`vercel logs`](https://vercel.com/docs/cli/logs).

### Verified current state and safe procedure

The existing browser session opened the `schoollove-kr` Production Logs page without a new login or token. The visible `Last 30 minutes` window showed Warning 0, Error 0, and Fatal 0. This is a point-in-time UI check, not a historical guarantee.

1. Confirm team, project, Production environment, host, and KST time before filtering.
2. Start with error/fatal and HTTP 5xx filters, then inspect the affected route and request ID. Do not open or copy request bodies unless strictly necessary.
3. Record only time range, route category, status, safe error class, request ID when needed, and remediation state. Redact names, email, messages, Instagram identifiers, authorization headers, cookies, IPs, raw invite tokens, and hashes.
4. Hobby runtime-log retention is one hour. Inspect immediately at every beta mutation gate and incident; retained evidence should be a sanitized incident note, not a bulk log export.
5. If the authenticated session loses log access, mark runtime monitoring unverified and stop before `active` transition or first invitation. Do not bypass the gate by creating credentials.

## Incident stop and rollback

Containment precedes rollback.

1. Trigger on `PRIVACY_EXPOSURE`, `RLS_FAILURE`, `HEALTH_FAILURE`, adult-boundary failure, target-school escape, unexpected feature access, invite bypass, sustained 5xx, or inability to observe a required safety gate.
2. Preserve safe evidence and invoke the narrowest supported stop. Use the program emergency stop for a program-wide incident; use scoped feature or invite stop only when containment is demonstrably sufficient.
3. Confirm the snapshot-backed active program becomes `paused`, `emergency_disabled_at` is set, and the audit event exists. Revoke unconsumed invites if their use could worsen the incident.
4. Do not delete members, profiles, school histories, immutable snapshots/allowlists, or audit rows. Do not change ownership.
5. Fix through reviewed code or a forward corrective migration, then pass isolated/Preview/Production checks and create a new readiness record after the emergency timestamp.
6. Reactivation requires separate approval and `admin_reactivate_controlled_beta_program()` with a safe reason and resolution code. Generic emergency clearing remains fail-closed.

## Migration `20260730100000` rollback analysis

There is no approved automatic down migration. The migration adds `target_school_id` to setup Drafts, setup snapshots, and beta members; adds the immutable `beta_program_schools` table; replaces lifecycle RPCs; and adds the private school-membership scope trigger.

- Current zero-beta-data state lowers immediate row-loss exposure, but rollback would still remove safety controls and break the merged application's expected function signatures and objects.
- After beta preparation or enrollment, dropping the new columns/table would destroy the enforceable link between program, snapshot, member, and school. Existing audit rows could remain while their school-contract evidence disappears.
- Restoring older RPC definitions would reintroduce the exact unsafe paused/active, invite, and school-scope behavior PHASE 10J closed.
- Foreign-key `RESTRICT` and immutable triggers make an ad hoc reverse order unsafe. Migration history must not be manually marked reverted to hide schema drift.

Required rollback order is therefore: stop and preserve evidence; assess row counts without personal fields; deploy a compatible reviewed application rollback only if required; apply a separately reviewed forward corrective migration; revalidate history, RLS/FORCE RLS, function owners/search paths/EXECUTE grants, public smoke, and readiness. Destructive schema rollback is an exceptional, separately approved operation.

## Active-transition prerequisites

All items must be true immediately before `admin_start_controlled_beta_program()`:

- separate operator approval for the exact program and time window;
- a new non-legacy program created `paused`, not `limited_beta_2026`;
- one immutable setup snapshot and exactly one matching `beta_program_schools` row;
- fixed contract: 20 members, exactly 14 days, one validated school UUID, one use per invite, expiry at most seven days, administrator approval waitlist;
- mandatory stops include `PRIVACY_EXPOSURE`, `RLS_FAILURE`, and `HEALTH_FAILURE`;
- all eight program-scoped flags exist; only `account_registration` and `private_profile` are enabled;
- no invite or member already exists for the first start;
- no emergency timestamp and current time is inside the 14-day window;
- latest readiness is `limited_beta`, has an affirmative operator decision, and has no blocker code;
- Production migration/history, RLS/grants, public smoke, runtime logs, and administrator authentication are healthy;
- no public profile/list/search/Instagram/connection/message/promotion/payment access is widened.

Any mismatch is fail-closed. A paused program may exist while a condition is repaired, but it must not become active.

## Target-school selection criteria

No school is selected by this audit. The operator must choose exactly one immutable `schools.id`, not a name string.

Required criteria:

- the operator can directly verify a small cohort of adult graduates and their consent;
- every invite candidate is at least 19 years old and has a past graduation year; current students and minor-targeted recruitment are excluded;
- canonical school name, region, type, and UUID are unambiguous, including same-name schools;
- 5–20 realistic adult participants are reachable without public scraping, bulk DM, rewards, or third-party account collection;
- the cohort can be supported for the complete 14-day window and incidents can be handled promptly;
- the choice does not require publishing a person list, exact small-cohort aggregate, Instagram identifier, or private school history;
- one-school membership enforcement can be tested without creating a Production test person.

Reject a school when adult status cannot be verified, current students are the likely audience, the UUID is ambiguous, recruitment depends on public personal data, or support/log coverage is unavailable.

## Operating sequence and gates

| Stage | Authorized operation after separate approval | Success condition | Immediate stop condition |
| --- | --- | --- | --- |
| 0. Baseline | Read-only checks | Expected deployment/migration, healthy logs/routes, no unapproved beta rows | Drift, 5xx/error increase, missing log access, migration/RLS mismatch |
| 1. School decision | Record one operator-selected UUID | Adult-graduate cohort and canonical UUID verified | Minor/current-student risk, ambiguous school, multi-school need |
| 2. Draft | Save and validate exact contract | Unique key, exact dates/capacity/features/stops/school | Validation mismatch or key conflict |
| 3. Paused program | Activate setup transaction only | One `paused` program, snapshot, allowlist, audit; zero invites/members/auto-enabled flags | Duplicate/missing rows, non-paused status, unrelated row change |
| 4. Feature setup | Configure program flags | Eight rows, exactly two enabled | Global or extra feature enabled |
| 5. Readiness | Record current decision | `limited_beta`, operator true, zero blockers | Privacy/RLS/health/log/smoke blocker |
| 6. Start | Atomic start RPC after approval | Program active, one start audit, contract unchanged | Any RPC rejection, missing audit, wrong time/emergency state |
| 7. Invite | Issue one hashed invite after second approval | One use, expiry ≤7 days and ≤program end, capacity available | Raw token logged, wrong recipient/school/adult status, program not eligible |
| 8. Redemption | Invitee uses valid invite | Pending-review member bound to invite and school; use count increments once | Replay, capacity, school, auth, consent, or adult-boundary failure |
| 9. Approval | Administrator reviews member | Only verified adult graduate becomes active; audit exists | Missing evidence/consent, school mismatch, out-of-window program |
| 10. Onboarding | User creates own private data | Own private profile and one selected-school history only | Public exposure, second/out-of-scope school, future year, RLS failure |
| 11. Daily operation | Read-only report and health review | No mandatory stop, masked small segments, stable routes/logs | Any mandatory stop or unexplained data/access change |
| 12. Emergency stop | Pause/disable/revoke as scoped | Access contained and audited; safety actions remain available | Containment fails or audit missing—escalate and keep closed |
| 13. Reactivation | Fresh readiness plus separate approval | Post-stop readiness, full contract recheck, audited active state | Stale readiness, unresolved cause, wrong flags/capacity/time |

## Expected Production data at a real start

Rows are created only after their separate gates:

| Moment | Expected mutation |
| --- | --- |
| Draft save/validation | One `beta_setup_drafts` row plus append-only `beta_audit_logs`; updates stay on that Draft until activation |
| Paused creation | One `beta_programs` row (`paused`), one immutable `beta_program_setup_snapshots` row, one immutable `beta_program_schools` row, Draft status update, audit row |
| Feature configuration | Eight program-scoped `beta_feature_flags` rows, exactly two enabled, plus audit row |
| Readiness/start | One `beta_readiness_snapshots` row; `beta_programs.status` update to `active`; audit rows |
| Each invitation | One `beta_invites` row containing hashes, limits, expiry and no raw token; audit row |
| Redemption/review | One `beta_members` row bound to program/invite/school, invite `use_count` update, later member review update, audit rows |
| User onboarding | Authentication provider account/session as applicable; `beta_onboarding_progress`, stage events and masked growth aggregates; at most one owner-only `private_profiles` row and one selected-school `profile_school_memberships` row |
| Stop/reactivation | Program emergency/status update, optional invite revocation or scoped flag disable, fresh readiness row before reactivation, audit rows |

The start does not require or authorize a public `profiles` row, connection request, message, Instagram permission, campaign, promotion request, order, payment, public school-person list, or public name search result.

## Privacy, minors, and school-scope audit

The merged boundaries remain structurally appropriate only when the operating contract is followed:

- Adult eligibility and required consent are checked before private profile creation. An invitation is not proof of age.
- Public APIs remain unable to return private profile rows, school/year/class person lists, names, Instagram identifiers, or member status.
- Program access uses the immutable school UUID and DB trigger, not free-text `target_scope`; a member is limited to one selected-school history and a non-future graduation year.
- Only owner-scoped private profile operations are enabled. People search, connection request, messaging, Instagram permission, promotion, and payment remain disabled.
- Administrator notes/logs use reason codes and opaque references; segments below 10 remain masked.
- `PRIVACY_EXPOSURE`, `RLS_FAILURE`, `HEALTH_FAILURE`, minor eligibility uncertainty, or school-scope escape stops the beta before further invites or approvals.

Residual operational risk is human verification: the database can enforce UUID, dates, capacity, flags, and ownership, but cannot independently prove that an invitee is an adult graduate. The operator's verified candidate list must remain outside application reports and contain only the minimum data needed for the approval decision.

## Still unverified or undecided

- Target school and invite candidates: intentionally undecided.
- The exact active/start time window: intentionally undecided.
- Real Draft, paused transaction, flag configuration, readiness, start, invite, redemption, member approval, onboarding, stop, and reactivation in Production: intentionally unexecuted.
- Full historical runtime-log review beyond the Hobby retention window: unavailable; only the visible point-in-time window was checked.
- Destructive rollback rehearsal: intentionally not executed; a forward corrective approach is the approved default.

## Explicitly not executed

- No code, test, package, environment, or migration change.
- No Supabase or Vercel setting change and no deployment.
- No Production data creation, update, deletion, ownership assignment, OTP, email, message, Instagram call, advertisement, order, or payment.

Final decision: `PHASE_10K_LIMITED_BETA_READINESS_AUDITED_NO_PRODUCTION_WRITES`.
