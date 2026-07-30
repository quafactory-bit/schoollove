# First controlled beta start runbook

## Scope

This runbook prepares one adult-graduate controlled beta. It does not itself authorize a Production migration, school choice, program start, invitation, OTP, message, Instagram permission, advertising action, or payment.

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

## Approval gates

1. Obtain separate approval to apply migration `20260730100000_first_controlled_beta_safety_boundaries.sql` to the identified Production project. Verify migration history, RLS/FORCE RLS, grants, existing row counts, and zero new operational rows.
2. Obtain the operator's explicit school decision. Select the school through the administrator school search and confirm the immutable UUID, not only its display name.
3. Save and validate a new uniquely keyed Draft with the fixed contract. Verify no existing program is reused.
4. Create the program. Confirm it is `paused`, has one snapshot, one matching allowlist row, zero invites, zero members, and no automatically enabled flags.
5. Configure the eight program-scoped flags. Confirm exactly two are enabled and the other six are disabled.
6. Record a `limited_beta` readiness decision with no blockers. Obtain separate explicit approval for active transition.
7. Start through `admin_start_controlled_beta_program()` only. Verify one start audit event and active access only for the two approved features.
8. Obtain a second explicit approval before issuing the first invitation. Issue one hashed invite for one use and at most seven days; never log or document the raw token.

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
