# Beta stop and rollback runbook

Trigger a stop on privacy exposure, report threshold, search bypass, message spam, RLS/health failure, cron/outbox delay, deletion backlog, advertiser complaint, admin anomaly, or migration mismatch.

1. Preserve evidence without raw personal content.
2. Stop the narrowest scope: search, messaging, promotion application/operations, or invites. Use `all` only for a systemic incident.
3. Confirm the feature/program state and audit row.
4. Confirm block, disconnect, and own-data deletion remain available.
5. Do not drop tables, delete users, reassign profile ownership, or alter existing public profiles.
6. Fix and verify in isolation, Preview, then Production through a reviewed corrective migration or hotfix.
7. Restore only after health, RLS, regression, privacy, and backlog checks pass.

Rollback is feature containment first; destructive schema rollback is not the default.

## PHASE 10J migration rollback boundary

Migration `20260730100000_first_controlled_beta_safety_boundaries.sql` has no approved automatic down migration. It adds the immutable one-school allowlist table and target-school columns, replaces administrator lifecycle RPCs, and adds school-scope enforcement. Removing it while the merged application expects those objects would weaken the beta boundary and can break administrator flows.

1. Stop or pause the affected program and features first. Revoke outstanding invites only when incident scope requires it; do not delete members or profiles.
2. Preserve audit/readiness evidence and count affected Draft, snapshot, allowlist, invite, member, and school-membership rows without outputting personal fields.
3. Prefer a reviewed forward corrective migration. Do not edit or mark the applied migration as reverted merely to make history look aligned.
4. A true schema rollback requires a separately approved compatible application rollback and an impact plan for every non-empty PHASE 10J column/table. Dropping `target_school_id` or `beta_program_schools` after beta rows exist would discard the enforceable school contract.
5. If no beta operational rows exist, data-loss exposure is lower, but rollback still removes safety controls and must not precede the compatible code rollback.
6. Reopen only after Production migration history, RLS/FORCE RLS, function owner/search path/EXECUTE grants, public smoke, and current readiness all pass.
