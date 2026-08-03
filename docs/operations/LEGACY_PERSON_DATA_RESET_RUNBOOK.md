# Legacy person data reset runbook

This runbook applies only to `20260802120000_legacy_person_data_reset.sql`. Local implementation does not authorize Production execution, merge, or deployment.

## Immutable safety contract

- Production `public` schema must be exactly 68 tables: delete only `reports`, `traces`, `search_logs`, and `profiles`; preserve the other 64.
- Keep 10,006 schools, migration history, RLS/FORCE RLS, security functions/triggers, private-account structures, controlled-beta definitions, and commercial structures.
- Do not contact, invite, claim, convert, export, or reuse a legacy registrant. A returning adult is a completely new private user.
- Do not select a beta school; it remains `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`.
- Do not output names, Instagram identifiers, messages, raw queries, emails, tokens, or user IDs.
- Never edit the assertion values to force drift through. Stop and use a separately reviewed forward corrective migration.

## Required deployment and drain order

1. Merge the reviewed application change that removes raw search logging and permanently returns fail-closed responses from legacy report/trace write routes.
2. Deploy that exact commit before the destructive migration. Verify `/api/profiles`, `/api/reports`, and `/api/traces` are fail-closed and school search still works without creating `search_logs` rows.
3. Enter a separately approved maintenance window and drain legacy requests at the edge/application layer.
4. Check `pg_stat_activity` using aggregate/session metadata only. Exclude the inspecting backend and stop if an active or waiting session can write `profiles`, `reports`, `traces`, or `search_logs`, or if the source is uncertain. Do not terminate sessions automatically.
5. Recheck exact aggregate baselines, catalog contracts, migration SHA-256, target project, and preceding migration history.
6. Only then apply the one reviewed migration through the approved migration path.

The app-deploy-first requirement is mandatory: table locks protect the transaction, but they do not prevent an older deployed application from writing immediately after commit.

## Preflight

- `profiles=25`, owner/hidden/reported `0`, distinct profile schools `13`;
- `reports=1`, `traces=8`, `search_logs=670`;
- `schools=10006`, every stored level 1, every level timestamp null;
- new private/account/connection/safety rows `0` and `editorial_features.account_id IS NOT NULL` rows `0`;
- real beta operation rows and scoped flags `0`; preserve one legacy program and eight global flags;
- promotion, advertising, order, and payment rows `0`;
- actual public tables exactly equal the reviewed 68-table contract;
- person-link UUID columns exactly equal the reviewed contract;
- PUBLIC/anon/authenticated table and column INSERT on all four legacy tables is absent; service-role has no raw `search_logs` access; no public write policy or executable write RPC remains.

Any mismatch stops the procedure before deletion.

## Apply and immediate verification

1. Apply only `20260802120000_legacy_person_data_reset.sql`; never copy individual DELETE statements into SQL Editor and never manipulate migration history.
2. Wait for the single transaction and confirm its migration-history entry.
3. Immediately confirm `profiles=0`, `reports=0`, `traces=0`, `search_logs=0`, and `schools=10006`.
4. Recheck immediately after commit and again after the request-drain interval that none of the four legacy tables has been repopulated.
5. Confirm all 64 preserved table counts, one legacy beta program, eight global flags, RLS/FORCE RLS, grants, policies, function owner/search path/EXECUTE, triggers, rankings, and school growth state.
6. Run read-only Home, Search, school page, people/account privacy, stale profile URL, sitemap, administrator empty-list, and runtime-log smoke checks. Do not create test data.

## Local evidence required before approval

The disposable database lifecycle must independently demonstrate normal success and full rollback for profile drift, a safety restriction, editorial account link, beta operation, advertising data, order data, payment data, an unclassified table, and a forced failure after earlier DELETE statements. A raw replay against the zero-row state must fail. Playwright must start Next.js against that actually reset database through PostgREST and cover Chromium plus mobile 360/390/412. An unreachable placeholder database URL is not reset E2E evidence.

## Failure and recovery

- Preflight mismatch or waiting writer: do not apply; record only safe aggregate evidence.
- Exception before commit: confirm migration history is absent and all four legacy counts are unchanged. Do not retry automatically or issue cleanup SQL.
- Unexpected partial state: contain public exposure, treat it as a privacy incident, and prepare a reviewed forward corrective migration. Do not conceal drift by repairing history.
- Post-commit repopulation: stop the stale writer, contain affected routes, preserve non-personal evidence, and use a reviewed forward correction. Do not restore legacy data.
- Stale cache/search-engine exposure: keep the database reset, contain the route/cache, and use the approved removal process.

Privacy-safe search statistics are not implemented by this reset. They require a separate design that cannot preserve raw queries or person identifiers.
