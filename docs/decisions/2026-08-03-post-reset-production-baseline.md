# PHASE 10M — Post-reset Production baseline

Status: `POST_RESET_BASELINE_FROZEN_NO_BETA_DATA`

## 1. Purpose

Freeze the verified Production state after PHASE 10L-F so all later development and operational approvals start from zero legacy personal-data rows. This document does not select a school or authorize any Production beta mutation.

## 2. Git and deployment baseline

- PR #37 was squash-merged and closed.
- Repository and Vercel Production baseline commit: `3d56ffe33c5f20abf44542c603bf3009708b5339`.
- The deployment was verified as Production, Current, and successful before the reset.
- The legacy-write-free application was deployed before the database migration, and the older deployment no longer served official-domain traffic.

## 3. Migration baseline

- Supabase CLI version: `2.111.0`.
- Linked Production project was verified before dry-run and push.
- Applied migration: `20260802120000_legacy_person_data_reset.sql`.
- Canonical LF SHA-256: `859732AE6FE22AD06FD257FAD254E5ED8DC0622364493B21FD00EA4D8E2190AB`.
- The same fixed CLI performed dry-run and `db push --linked`; the push exited with code 0 and was not retried.
- Production migration history contains 16 versions and records `20260802120000` exactly once.
- This is a completed one-shot migration. It must not be replayed or modified.

## 4. Production data baseline

| Domain | Frozen baseline |
| --- | ---: |
| `profiles` | 0 |
| `reports` | 0 |
| `traces` | 0 |
| `search_logs` | 0 |
| `schools` | 10,006 |
| School growth drift | 0 |
| New private/account/connection data | 0 |
| Editorial account links | 0 |
| Actual beta operational rows | 0 |
| Beta programs | 1 legacy definition |
| Global beta flags | 8 |
| Scoped beta flags | 0 |
| Commercial rows | 0 |
| Public tables | 68 = 4 legacy-empty + 64 preserved |
| Ranking rows | 0 |

The migration verified unchanged table-by-table row counts for all 64 preserved tables. Immediate and post-drain checks found no recreation of any of the four legacy tables.

## 5. Security and permission baseline

- RLS remains enabled on all four legacy tables.
- FORCE RLS remains enabled on `private_profiles` and `beta_programs`.
- PUBLIC/anon/authenticated legacy INSERT table grants: 0.
- Legacy INSERT column grants: 0.
- Legacy INSERT policies: 0.
- Publicly executable legacy write RPCs: 0.
- Service-role raw `search_logs` privilege: absent.
- Existing private-account, connection, safety, controlled-beta, audit, promotion, order, and payment structures remain present and unchanged.

## 6. Public exposure baseline

- Home and School Hub return 200; school search remains available without raw query persistence.
- Public person lists remain hidden.
- `/people/search` and `/account` require the adult private login boundary.
- A stale profile URL returns 404.
- Sitemap returns 200 and contains no profile or people path.
- `/api/profiles`, `/api/reports`, and `/api/traces` return fixed 503 boundaries without request parsing or database persistence.
- The reviewed runtime window had Warning 0, Error 0, Fatal 0, and no unintended 5xx.

## 7. Controlled-beta baseline

- Target school: `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`.
- Actual beta Draft, setup snapshot, school allowlist, readiness, invite, member, campaign, onboarding, task, note, metric, aggregate, audit, and scoped flag rows: 0.
- No school is selected and no school identifier is stored by this baseline freeze.
- The first real beta must use a new snapshot-backed program created initially as `paused`.

## 8. Prohibited legacy behavior

- Do not query, contact, claim, convert, assign ownership to, invite, export, or reuse an existing registrant.
- A returning person is a completely new user and must pass current adult confirmation, consent, authentication, ownership, and private-by-default boundaries.
- Do not restore raw search persistence or reopen legacy profile/report/trace write routes.
- Do not replay the reset migration, rewrite its history, or alter its assertions to fit later drift.

## 9. Next approval gate

- PHASE 10N-A supersedes the immediate beta-start sequence: complete and independently approve the public adult-account soft launch before selecting a controlled-beta school.
- Production public-account migration, application deployment, internal Auth test, readiness, and `open` are separate gates; the default and current Production state remain closed.
- School selection requires a separate explicit operator decision.
- The decision must use the exact immutable `schools.id`, not a school-name string.
- No Production Draft may be created before the public-account decision and a later school decision are complete.
- The beta must use a new snapshot-backed program; do not reuse `limited_beta_2026`.
- School decision and every Production mutation are outside this PR's scope.

## 10. Final decision

The post-reset Production baseline is frozen with zero legacy personal-data rows and zero real beta operational data. Documentation or future code that assumes legacy rows still exist is stale; any Production beta mutation still requires its separate approval gate.

Final status: `POST_RESET_BASELINE_FROZEN_NO_BETA_DATA`.
