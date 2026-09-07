# Class history self-service — local verification

Historical pre-hardening verification only. The final PR100 authority, revised checksum, separate PD capability and deterministic concurrency results are in `2026-09-07-class-history-self-service-hardening.md`. Statements below describe the initial implementation, not the current release contract. Not canonical Preview/Production verified.

## Source and scope

- Branch: `codex/class-history-self-service`.
- Starting Preview SHA: `2952a6c4e450736a963ef6fc911859afe0c6b137`; tree: `7a42291fbcf142495be237ec61246718fa75e943`.
- Starting main: `bee7988f487f0289f173b6f2508bdbd128636bbc`.
- Supabase CLI `2.82.0` was downloaded/executed once via npx after explicit approval to create one new migration. No dependency or lockfile change.
- Migration: `20260907031506_class_history_self_service.sql`.
- SHA-256: `f3bc093c855ce45ba99040635f3487a7b776ae35542363abab82aec9a6d854f0`.
- Modified runtime: AccountClient, MySchoolsPanel, new ClassHistoryEditor and owner PATCH route. Added forward SQL, tests, disposable verification tools and decision/FROZEN change records.
- Existing migration files, search RPCs, new membership RPC, account export implementation, flags and external configuration were not changed.

## Deployed-schema disposable proof

Read-only Preview schema-only export at migration 43, with no user row data, restored into disposable PostgreSQL 17.6.1.143. Final migration applied once to a fresh disposable clone. Public schema baseline: 73 tables, 723 columns, 193 functions. After: 73/723/194; table and column deltas zero, function +1. SQL contains no new index/trigger/table/column DDL.

Exact-person, same-class and create-membership function definitions were byte-for-byte preserved. Child RLS/FORCE RLS and authenticated direct-write denial remain. New owner RPC is SECURITY DEFINER with empty search_path; PUBLIC/anon execution denied, authenticated/service_role execution allowed (auth.uid still required).

Executed rollback matrix passed: owner full replace, fewer/multiple rows, clear and re-add; normalized no-op row/timestamp/token preservation; malformed/duplicate/out-of-range input; missing/non-owner membership; direct-write denial; elementary/middle/high limits and non-K12 clear-only; access/adult/consent/safety/deletion denial; insertion-failure atomic rollback; child cascade. Actual change invalidates live unused owner-related match tokens, preserving used/expired/unrelated tokens and existing parent/request/connection data. No concurrency-with-search claim is made.

No real A/B history, live search, remote migration or remote application-data write occurred. Temporary containers and schema dump/local CLI-link directory were removed; dumps are not committed.

## Application checks

- Targeted tests: 6 files / 43 tests passed.
- `npm run typecheck`: passed.
- `npm test`: 192 files / 1,552 tests passed; 3 files / 4 tests skipped.
- `npm run lint`: 0 errors, 86 existing warnings.
- `npm run build`: completed (63 generated pages); fake loopback Supabase build configuration, not Production credentials.
- `node scripts/class-history-self-service/verify-ui.cjs`: real editor component in local mocked API/router harness passed at 360/390/412px; add/edit/preload/cancel/clear/non-K12/closed and overflow zero. This is not deployed authenticated UI evidence.
- `git diff --check`: passed. Scoped secret-pattern scan of changed/new files: zero hits (not a comprehensive credential audit).
- Existing schoolMembershipWritable gate is retained; no automatic new access is granted to People Discovery-only members. Export implementation unchanged; live export not exercised.

## Search regression and release boundary

Initial automatic approval review rejected the disposable search execution because attachment-based authority was not accepted against the older AGENTS restriction. Execution remained stopped until the user directly approved local synthetic exact-person/same-class regression on 2026-09-07.

After that direct approval, a fresh schema-only clone at migration 43 passed the complete rollback matrix including `SAME_CLASS_NEW_HISTORY_CLEAR_LEGACY_EXACT_PASS`: new history matches, old history unavailable, cleared actor history unavailable, legacy exact-person success and generic non-match unchanged. No live Preview/Production search was performed. The final migration checksum above is unchanged.

Source commit/push, Preview-base Draft PR and feature deployment are approved next steps; their exact resulting IDs are recorded in the PR/final handoff, not inferred from this pre-commit report. Canonical Preview merge and all remote migration application remain forbidden. Preview/Production data writes, Production deployment, external environment changes and live OAuth are zero.

Final handoff: 25 files staged; commit/push execution was rejected by automatic approval review, which required direct approval for the exact commit/push rather than accepting the original attachment. HEAD remains the starting Preview SHA; commit, Draft PR and deployment are not created. Working tree is intentionally not clean. Final read-only Production counts: migrations 43, Auth users 2, memberships 2, class histories 0, active connections 1. Final scoped secret-pattern scan and staged diff check passed; new temporary dump and disposable container removed.
