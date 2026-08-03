# PHASE 10L — Legacy person data reset

Status: `PHASE_10L_F_PRODUCTION_LEGACY_PERSON_DATA_RESET_COMPLETE`

## Current state

The reviewed reset was executed in Production on 2026-08-03 after PR #37 merge commit `3d56ffe33c5f20abf44542c603bf3009708b5339` was deployed and legacy application writers were drained. Migration `20260802120000_legacy_person_data_reset.sql` is recorded exactly once. The four legacy tables are now empty, 10,006 schools and all 64 preserved public tables remain intact, raw search persistence stays closed, and no real controlled-beta or commercial data was created. The local audit and migration-design sections below are retained as the historical basis for that execution.

## Decision

The 25 pre-account public profile rows will not be verified, claimed, converted, invited, contacted, or reused as demand data. After a separately approved Production migration, all legacy person rows and the legacy raw-search/trace derivatives will be gone. A returning person must pass the current adult, consent, authentication, ownership, private-by-default, and controlled-beta boundaries as a completely new user.

This reset does not stop the approved product roadmap. The private account, connection, safety, promotion, payment, and controlled-beta schemas and code remain in place for future separately approved operation. The first controlled-beta school is still `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`.

## Read-only Production audit

No nickname, Instagram identifier, message, search text, email, or user identifier was read or recorded. Only counts, schema metadata, constraints, triggers, policies, and aggregate classifications were inspected.

| Object | Current rows | Action | Dependency and postcondition |
| --- | ---: | --- | --- |
| `profiles` | 25 | Delete | 0 owned, 0 hidden, 0 with stored reports, 13 schools; delete last after explicit dependents; expected 0 |
| `reports` | 1 | Delete first | FK to `profiles(id) ON DELETE CASCADE`; insert trigger calls `handle_report_count()`; expected 0 |
| `traces` | 8 | Delete | Standalone legacy person/message rows across 5 schools; FK to `schools` only; expected 0 |
| `search_logs` | 670 | Delete | Raw query column cannot be proven person-free row by row without processing personal text; 108 exact school-name matches, 0 exact legacy-nickname matches, 0 `@` markers, 0 clicked-school links; purge all legacy raw telemetry; expected 0 |
| `schools` | 10,006 | Keep | 13 referenced by profiles; every stored level is 1 and every `level_updated_at` is null; affected school growth state remains/reset to level 1; expected 10,006 |
| New private/account tables | 0 user rows | Keep | `private_profiles`, memberships, adult eligibility, consents, deletion requests, and export jobs remain structurally unchanged |
| Connection/safety tables | 0 | Keep | Match tokens, requests, connections, messages, Instagram permissions, notifications, blocks, and safety reports remain structurally unchanged |
| Controlled-beta definitions | 1 legacy program, 8 global flags | Keep | No setup Draft, snapshot, allowlist, readiness, invite, member, program/user flag, campaign, feedback, onboarding, task, note, metric, or beta audit row exists |
| Promotion/order/payment tables | 0 | Keep | All audited commercial tables remain structurally unchanged |
| System audit | 0 administrator audit rows | Keep | Non-personal system audit structures are not deleted |

The Production catalog is an exact closed contract of **68 public tables = 4 delete + 64 preserve**. The preserve set includes `safety_account_restrictions`, `editorial_features`, `operational_event_counters`, `operational_incidents`, `operational_job_runs`, and `retention_policy_versions`. Any unclassified/missing table, nonexistent contract entry, or unexpected UUID `account_id`/`user_id`/`profile_id`/`private_profile_id`/`member_id`/`invite_id`-style person link aborts before deletion. A safety restriction row or an editorial row with an account link also aborts; neither is silently deleted.

The catalog audit found no public view or materialized view over `profiles`. The remaining functions that reference profiles are retained because they implement current administrative, safety, private-account, ranking, or controlled-beta behavior. Profile/search indexes need no manual rebuild: deleting base rows removes their index entries transactionally. The sitemap reads only school slugs and does not query profiles or person fields.

## Migration boundary

Migration `20260802120000_legacy_person_data_reset.sql` is forward-only and does not edit an earlier migration or migration history.

1. Validate 68 = 4 delete + 64 preserve and the complete person-link column catalog, then acquire locks over all 68 tables in deterministic order.
2. Permanently revoke PUBLIC/anon/authenticated legacy INSERT paths, including column grants, and remove raw service-role access to `search_logs`.
3. Snapshot the affected school IDs in a transaction-local table.
4. Accept only the exact audited Production baseline. An already-empty or partially reset replay fails.
5. Fail before deletion if the 25/1/8/670/10,006 baseline drifts, any profile has an owner, new account/connection/safety data exists, an editorial account link exists, real beta operation data exists, a program/user flag exists, or commercial data exists.
6. Delete `reports`, then `traces`, then `search_logs`.
7. Normalize only profile-affected schools to level 1 with no level timestamp.
8. Delete `profiles`.
9. Assert all four legacy tables are empty, all 64 preserved counts are unchanged, affected school growth is reset, the ranking function returns no row, and public legacy writes remain closed.
10. Commit once. Any exception rolls back the complete transaction.

The migration never deletes an authentication user, private profile, school, beta row, audit row, promotion/order/payment row, or security object. It does not create an ownership mapping or a replacement profile.

## Public exposure after reset

- Home, public school pages, year/class compatibility routes, people search, and public APIs already fail closed for legacy person rows under PHASE 10A–10J.
- There is no public profile-detail route. A stale unknown path resolves through the normal not-found boundary.
- `sitemap.xml` contains Home and school-slug URLs only.
- The ranking RPC and school person counts derive from `profiles`; with zero rows they return no legacy activity.
- Raw query persistence is permanently retired. School lookup still works, while privacy-preserving search telemetry requires a separately approved design.
- The administrator profile query returns an empty list after reset; its authentication boundary remains unchanged.
- No application cache or materialized database object containing profile rows was found. Post-apply smoke must still verify official-domain responses and any platform cache behavior.

## Local verification

The isolated PostgreSQL suite builds the complete schema, generates synthetic data with the audited counts, and requires:

- legacy person/search rows 0;
- schools 10,006 and school growth level 1;
- private/account/connection data 0;
- controlled-beta operational data 0 while the existing program and eight global flags remain;
- promotion/order/payment data 0;
- legacy and private RLS/grants unchanged;
- the complete PHASE 10J lifecycle and permission suites still pass;
- independent full rollback for profile, safety restriction, editorial account link, beta operation, advertising, order, payment, unclassified public table, and forced mid-delete failure scenarios;
- an already-empty replay is rejected;
- Next.js and Playwright use the actually reset disposable database, not an unreachable placeholder URL.

No Production migration, data deletion, deployment, school selection, beta operation, invitation, communication, Instagram action, promotion, order, or payment was performed in PHASE 10L implementation.

## Production execution result

- Applied on 2026-08-03 through the reviewed Supabase migration path; migration history records `20260802120000` exactly once.
- `profiles`, `reports`, `traces`, and `search_logs` are 0.
- 10,006 schools and the unchanged row counts of all 64 preserved public tables remain intact.
- Immediate and post-drain verification found no legacy-row recreation.
- Legacy write closure remains enforced: no PUBLIC/anon/authenticated INSERT grant, column grant, INSERT policy, or publicly executable legacy write RPC remains, and service-role has no raw `search_logs` privilege.
- Existing registrants were not queried, contacted, claimed, converted, invited, assigned ownership, or reused. A returning person follows the new private-account path.
- This one-shot migration must not be run again. Any future cleanup requires a separately reviewed forward migration; migration history and the existing assertions must not be rewritten.

Final status: `PHASE_10L_F_PRODUCTION_LEGACY_PERSON_DATA_RESET_COMPLETE`.
