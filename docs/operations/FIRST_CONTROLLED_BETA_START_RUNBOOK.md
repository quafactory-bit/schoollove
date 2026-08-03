# First controlled beta start runbook

## Scope

This runbook prepares one adult-graduate controlled beta. PHASE 10J migration `20260730100000_first_controlled_beta_safety_boundaries.sql` is already applied, but this runbook does not itself authorize a school choice, Production Draft/program creation, program start, invitation, OTP, message, Instagram permission, advertising action, or payment.

## Fixed contract

- Maximum members: 20
- Duration: exactly 14 days
- Allowed schools: exactly one validated `schools.id`
- Invite use: once
- Invite expiry: no more than seven days and never beyond program end
- Approval waitlist: required
- Enabled features: `account_registration`, `private_profile`
- Disabled features: `people_search`, `connection_request`, `messaging`, `instagram_permission`, `promotion_application`, `promotion_operations`
- Mandatory stops: `PRIVACY_EXPOSURE`, `RLS_FAILURE`, `HEALTH_FAILURE`
- Initial program status: `paused`

Until the operator explicitly selects the first school, record `TARGET_SCHOOL_PENDING_OPERATOR_DECISION` and stop before creating a Production Draft.

## Stage 0 — Post-reset Production baseline

Before any school-decision or mutation gate, confirm all of the following read-only:

- latest Production migration history version is `20260802120000`;
- `profiles`, `reports`, `traces`, and `search_logs` are all 0;
- `schools` is 10,006;
- scoped beta flags are 0, actual beta operational rows are 0, and commercial rows are 0;
- `/api/profiles`, `/api/reports`, and `/api/traces` remain fixed 503 boundaries;
- public person lists remain hidden and sitemap contains no profile or people path;
- the target school remains `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`, and no Production Draft may be created before the operator makes a separate explicit school decision.

School selection, Draft creation, snapshot-backed `paused` program creation, `active` transition, and invite issuance each require their existing separate approval. Do not reuse the legacy `limited_beta_2026` program.

## Approval gates

1. Confirm Production remains on the post-reset baseline, migration history is current through `20260802120000` (including the PHASE 10J migration), RLS/FORCE RLS and grants remain intact, and no unapproved beta operational rows exist.
2. Obtain the operator's explicit school decision. Select the school through the administrator school search and confirm the immutable UUID, not only its display name.
3. Save and validate a new uniquely keyed Draft with the fixed contract. Verify no existing program is reused.
4. Create the program. Confirm it is `paused`, has one snapshot, one matching allowlist row, zero invites, zero members, and no automatically enabled flags.
5. Configure the eight program-scoped flags. Confirm exactly two are enabled and the other six are disabled.
6. Record a `limited_beta` readiness decision with no blockers. Obtain separate explicit approval for active transition.
7. Start through `admin_start_controlled_beta_program()` only. Verify one start audit event and active access only for the two approved features.
8. Obtain a second explicit approval before issuing the first invitation. Issue one hashed invite for one use and at most seven days; never log or document the raw token.

## Runtime-log prerequisite

- Use the Vercel project Logs page with an already authenticated account that can view observability/log data. Do not issue a new token, extract browser credentials, or grant deployment/settings permissions merely to read logs.
- The current Hobby project exposes runtime logs in the dashboard but retains them for a short window. At every mutation gate, record the KST time and inspect Production warnings, errors, fatal entries, 4xx/5xx changes, and the affected route immediately.
- Keep names, email addresses, messages, Instagram identifiers, invite tokens, cookies, authorization headers, and request bodies out of copied evidence.
- Log access failure is a stop condition for active transition and first invitation; mark it unverified rather than bypassing the gate.

## Stage outcomes

| Stage | Success | Stop |
| --- | --- | --- |
| Baseline | Expected Git/deployment/migration, no unapproved rows, healthy public routes and logs | Any drift, 5xx increase, migration mismatch, or inaccessible mandatory evidence |
| School decision | One adult-graduate cohort is operator-verifiable and one immutable school UUID is confirmed | School identity ambiguity, current-minor targeting, or need for broader school scope |
| Draft and paused creation | Exact fixed contract; one snapshot and allowlist; zero invite/member; program `paused` | Any duplicate, mutable/missing snapshot, wrong dates/capacity/school/stops/features |
| Feature/readiness | Exactly two allowed program flags; current health/RLS/privacy readiness has no blockers | Global/extra feature access, stale readiness, or any mandatory blocker |
| Active transition | Separately approved atomic RPC; one audit event; contract unchanged | Non-atomic transition, missing audit, emergency state, time-window mismatch |
| First invite | Separately approved active in-window program; one-use hashed invite; capacity available | Raw-token exposure, paused/full/out-of-window program, school or adult-boundary uncertainty |
| Member approval | Verified adult graduate, required consent, invite/school/capacity rechecked | Under-19 risk, school mismatch, missing consent, capacity or RLS failure |

## Fail-closed checks

- Stop if the snapshot, selected school, allowlist, dates, capacity, stop conditions, flags, or readiness differ from the fixed contract.
- Do not issue an invite while the program is paused, outside its time window, emergency-disabled, legacy/snapshotless, full, or missing its one-school contract.
- Before member approval, recheck adult eligibility, required consent, active/time/emergency state, invite integrity, capacity, and the immutable target school.
- A member may create only a private profile and one school history for the selected school and a non-future graduation year.
- Do not use `limited_beta_2026` for the first real beta.

## Emergency stop and reactivation

1. On `PRIVACY_EXPOSURE`, `RLS_FAILURE`, `HEALTH_FAILURE`, adult-boundary failure, out-of-scope school acceptance, unexpected feature access, or invite bypass, stop first and preserve evidence.
2. Confirm the snapshot-backed program is paused and `emergency_disabled_at` is set. Revoke outstanding invites if incident scope requires it.
3. Never clear the emergency state through the generic emergency action; it is intentionally fail-closed.
4. Fix and verify the incident, then record a new readiness result after the stop.
5. Obtain separate reactivation approval and use `admin_reactivate_controlled_beta_program()` with an explicit resolution code.
6. Do not roll back by deleting profiles, changing ownership, modifying immutable contracts, or rewriting audit logs.

## Privacy and audit

- Keep personal names, raw email addresses, Instagram identifiers, messages, search terms, IP addresses, cookies, and raw invite tokens out of administrator notes and reports.
- Continue masking aggregate segments below 10 people.
- Record only safe reason codes and coarse operational state.
- Verify every mutation produces the expected audit event and no unrelated Production row changes.
