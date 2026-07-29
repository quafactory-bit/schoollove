# PHASE 10I — Controlled beta operations

## Decision

PHASE 10I adds an operator-only package for running a small, adult-only beta without opening personal features to the public.

- A beta setup wizard creates a reviewed draft first. Activation is an explicit administrator action and creates a **paused** program; it never creates invites or enables a public launch.
- Activation atomically copies the validated draft into one immutable program setup snapshot. The snapshot preserves capacity, target scope, allowed features, invite policy, approval waitlist, and mandatory stop conditions; retrying activation returns the same program without duplicating either row.
- Draft keys remain editable before activation, but conflicts with another draft or an existing program fail with explicit safe errors. Snapshot capacity, invite limits, and feature allowlists are enforced again at the database RPC/access boundary.
- Beta users, schools, advertisers, feedback, tasks, daily reports, stop controls, and readiness are shown as minimum-data operational views.
- Small segments below 10 are masked. Person lists, raw names, raw email, Instagram identifiers, search terms, messages, IP addresses, cookies, and tokens are not returned by the operator APIs.
- User feedback is limited to the signed-in user's own row and does not automatically attach page HTML, messages, search text, tokens, or cookies.
- Synthetic operations are enabled only when `CONTROLLED_BETA_SYNTHETIC_MODE=enabled` and `VERCEL_ENV` is not `production`. Production calls return 404 and create no synthetic rows.
- Emergency controls only restrict features. They never automatically contact users, mutate existing public profiles, enable live payment, or make a public launch.
- Every setup must enable `PRIVACY_EXPOSURE`, `RLS_FAILURE`, and `HEALTH_FAILURE` stop conditions in both the application schema and database contract.
- `launch_candidate` is an operator judgement label, not an automatic activation signal.

## Non-goals

- No Production migration or deployment in PHASE 10I.
- No public launch, automatic invitations, real OTP, real messages, real advertising notifications, or live payment.
- No ownership assignment or mutation of the existing 25 public profiles.
