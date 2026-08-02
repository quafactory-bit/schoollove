# Legacy person data reset runbook

This runbook applies only to `20260802120000_legacy_person_data_reset.sql`. Implementation and local verification do not authorize Production execution. Production application, merge, and deployment require a separate explicit approval.

## Safety contract

- Delete only the audited legacy `reports`, `traces`, `search_logs`, and `profiles` rows.
- Keep all 10,006 schools, migration history, RLS/policies/grants, security functions/triggers, private-account structures, controlled-beta structures and definitions, and commercial structures.
- Do not contact, invite, claim, convert, export, or reuse a legacy registrant.
- Do not choose a beta school or create a Draft, program, snapshot, allowlist, flag, readiness row, invite, or member.
- Do not output names, Instagram identifiers, messages, raw search queries, emails, tokens, or user IDs during validation.
- Do not edit this migration to force a changed Production baseline through. Stop and create a separately reviewed forward migration if the audit no longer matches.

## Before the approved maintenance window

1. Confirm the approved merge commit, clean working tree, exact Production project `ucnybhzpbatzcipwqtox`, and migration history through the immediately preceding migration.
2. Compute and compare the migration SHA-256 with the reviewed PR artifact.
3. Run aggregate-only preflight queries and confirm:
   - `profiles=25`, owner-linked/hidden/reported profiles `0`, distinct profile schools `13`;
   - `reports=1`, `traces=8`, `search_logs=670`;
   - `schools=10006`, non-level-1 schools `0`, non-null level timestamps `0`;
   - new private/account/connection rows `0`;
   - real controlled-beta operation rows and program/user-scoped flags `0`;
   - preserved beta definitions are one legacy program and eight global flags;
   - audited promotion/order/payment rows `0`.
4. Confirm public legacy writes remain closed and runtime logs are available. Do not inspect request bodies or personal fields.
5. If any value differs, stop before applying the migration. Record only the aggregate mismatch.

## Apply

1. Apply only `20260802120000_legacy_person_data_reset.sql` through the approved Supabase migration path.
2. Do not run individual `DELETE` statements from the dashboard.
3. Do not mark migration history manually.
4. Wait for one successful transaction and record its migration-history entry.

The migration locks every audited domain against concurrent writes, validates the exact baseline, deletes explicit dependents before profiles, and runs postconditions before commit. Any assertion or SQL error aborts the transaction; do not retry automatically.

## Post-apply database verification

Read aggregates only:

- `profiles=0`, `reports=0`, `traces=0`, `search_logs=0`;
- schools remain `10006` and affected schools have level 1 with a null level timestamp;
- ranking returns zero rows and raw-search aggregate returns zero;
- new private/account/connection data remains `0`;
- beta operation data remains `0`, with the existing program and eight global flags unchanged;
- promotion/order/payment counts are unchanged;
- RLS/FORCE RLS, policies, grants, function owner/search path/EXECUTE boundaries, triggers, and migration history match the preflight catalog.

Do not create a test profile, account, invite, member, message, order, or payment to verify the reset.

## Post-apply application smoke

Verify without writes:

- Home, Search, and a school page respond normally without a person list;
- people search and account routes retain authentication/private SEO boundaries;
- stale or unknown person/profile URLs return the normal not-found or policy-defined non-disclosure response;
- `sitemap.xml` contains no person/profile/year/class URL;
- administrator profile listing is empty after authenticated operator review;
- public profile writes remain exact 503 fail-closed; trace/report writes return a non-success response and disclose no person fields under their existing policy/configuration boundary;
- Production logs show no new migration, RLS, 5xx, or cache errors.

If a stale CDN/search-engine copy is discovered, do not recreate or modify person rows. Contain the public route/cache, preserve non-personal evidence, and use the approved platform removal path.

## Failure and recovery

- Preflight mismatch: do not apply. Re-audit schema and counts without personal output.
- Migration exception before commit: confirm history was not recorded and all four legacy table counts are unchanged. Do not issue manual cleanup SQL.
- Unexpected partial state: treat as a privacy incident, stop public exposure, capture aggregate evidence, and prepare a reviewed forward corrective migration. Never repair migration history to conceal drift.
- Post-apply public exposure: keep the database reset, contain the route/cache, and fix forward. Do not restore legacy person data.

Success may be declared only after database and official-domain checks pass and Production remains at zero legacy people. The actual controlled beta still needs separate school, program, active-transition, and invitation approvals.
