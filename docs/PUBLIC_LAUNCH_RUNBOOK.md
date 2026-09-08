# Public account launch runbook

Authority: 2026-09-08 user-approved public launch readiness phase. This document
is an execution contract, not evidence that launch has occurred.

## Boundaries

Public account registration enables only Google authentication, adult eligibility,
four required consents, an owner-private profile and up to three past school
memberships. Grade/class children are optional; no grade is inferred from legacy
class_number. Public registration grants no People Discovery, connection request,
messaging, or Instagram sharing entitlement. Existing controlled-beta school and
feature restrictions remain stronger than public account permissions.

Preserve A/B/C, both accepted connections, existing notifications and historical
Instagram evidence. Do not create a fourth test principal. No raw name query,
email, token, code, cookie, recovery content or signing key in evidence/logs.

## Release gates

1. Verify main/preview SHA, clean source, exact migration hash/history and safe
   count/hash baseline. Stop on unexplained drift or unknown migration outcome.
2. Pass targeted/full tests, typecheck, lint (existing warnings identified), build,
   diff/secret review, disposable deployed-schema upgrade, deletion failure/retry,
   emergency/registration boundary, and capacity race tests.
3. Apply only the pending migration to Preview with explicit project reference
   and `--skip-vault`; never blind retry. Read back history/schema/grants and
   compare existing-row fingerprints. Merge canonical Preview and verify exact
   SHA/READY/alias plus component/public/authenticated smoke where available.
4. Release only the approved change from main, apply Production migration once,
   repeat postflight, merge and verify exact Production SHA/READY/alias.
5. Verify Google Production audience/publishing and non-secret OIDC contracts,
   recovery delivery readiness, runtime health, actual operator access and
   existing C new-user evidence. Missing evidence remains a launch blocker.

## Controlled cohort

The immutable People Discovery snapshot ceiling remains 20. A narrower
`operational_max_users` is configured only with
`admin_set_beta_operational_cap(program, cap, reason, actor)` through the official
admin route/UI. NULL means no additional operational ceiling, NOT three.

Occupancy includes distinct pending/active/suspended members, live claims and
unused valid invite reservations without double counting transitional claims or
members. A program-row lock plus post-write trigger rejects overcapacity;
snapshot maximum and all existing onboarding gates remain in force.

Candidate decision: EXPAND_5 after full release/readiness, not configured by this
document. Issue no invites merely to fill capacity. Do not change legacy programs,
Instagram membership or the existing beta end date without the applicable scope.

## Open only after GO

Use `/admin/operations` and its authenticated `/api/admin/public-account`
actions (or exact corresponding service-only official RPCs). First record fresh
immutable readiness with exact deployed commit and uppercase LF migration SHA256;
then open referencing that readiness. No direct UPDATE and no generic state setter
to bypass readiness. All evidence booleans must be true on evidence, not defaults.

`migration_version=20260803120000` is the existing readiness-contract identifier,
not the latest migration history. `auth_smtp` is a legacy readiness field: document
Google/OIDC plus SchoolLove recovery delivery evidence, never claim Supabase email
login is supported. Record current migration number/hash separately.

Public open sets account_registration/private_profile/school_membership true.
People Discovery remains controlled, messaging remains OFF, Connected Instagram
remains the existing A/B directed-permission cohort.

## Observation

Check immediately and once at 30–60 minutes: HTTP/login/account boundaries,
5xx/timeouts, safe Auth/claim/cleanup/incident counts, launch/feature state and
unexpected user-data drift. Use a real scheduled mechanism if leaving the turn;
do not imply continuous monitoring. No additional real search or message needed.

Daily operator minimum: program end date, occupancy/reservations, pending review,
incident/readiness blockers, failed cleanup jobs, abnormal OAuth coarse errors,
health, feature state and public privacy surface. Never auto-extend/end the beta.
