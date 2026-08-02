# PHASE 10L — Legacy person data reset

Status: `IMPLEMENTED_LOCAL_VERIFIED_PRODUCTION_PENDING`

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

The catalog audit found no public view or materialized view over `profiles`. The remaining functions that reference profiles are retained because they implement current administrative, safety, private-account, ranking, or controlled-beta behavior. Profile/search indexes need no manual rebuild: deleting base rows removes their index entries transactionally. The sitemap reads only school slugs and does not query profiles or person fields.

## Migration boundary

Migration `20260802120000_legacy_person_data_reset.sql` is forward-only and does not edit an earlier migration or migration history.

1. Acquire write-conflicting locks across deletion targets and every asserted preserved domain.
2. Snapshot the affected school IDs in a transaction-local table.
3. Accept either the exact audited Production baseline or an all-zero legacy state used by fresh migration replay.
4. Fail before deletion if the 25/1/8/670/10,006 baseline drifts, any profile has an owner, new account/connection data exists, real beta operation data exists, a program/user flag exists, or commercial data exists.
5. Delete `reports`, then `traces`, then `search_logs`.
6. Normalize only profile-affected schools to level 1 with no level timestamp.
7. Delete `profiles`.
8. Assert all four legacy tables are empty, affected school growth is reset, and the ranking function returns no row.
9. Commit once. Any exception rolls back the complete transaction.

The migration never deletes an authentication user, private profile, school, beta row, audit row, promotion/order/payment row, or security object. It does not create an ownership mapping or a replacement profile.

## Public exposure after reset

- Home, public school pages, year/class compatibility routes, people search, and public APIs already fail closed for legacy person rows under PHASE 10A–10J.
- There is no public profile-detail route. A stale unknown path resolves through the normal not-found boundary.
- `sitemap.xml` contains Home and school-slug URLs only.
- The ranking RPC and school person counts derive from `profiles`; with zero rows they return no legacy activity.
- The raw search-count RPC remains defined but returns zero after `search_logs` is emptied.
- The administrator profile query returns an empty list after reset; its authentication boundary remains unchanged.
- No application cache or materialized database object containing profile rows was found. Post-apply smoke must still verify official-domain responses and any platform cache behavior.

## Local verification

The isolated PostgreSQL suite built the complete schema, generated synthetic data with the audited counts, applied the reset, and confirmed:

- legacy person/search rows 0;
- schools 10,006 and school growth level 1;
- private/account/connection data 0;
- controlled-beta operational data 0 while the existing program and eight global flags remain;
- promotion/order/payment data 0;
- legacy and private RLS/grants unchanged;
- the complete PHASE 10J lifecycle and permission suites still pass;
- a drifted one-profile baseline is rejected without deleting that row.

No Production migration, data deletion, deployment, school selection, beta operation, invitation, communication, Instagram action, promotion, order, or payment was performed in PHASE 10L implementation.
