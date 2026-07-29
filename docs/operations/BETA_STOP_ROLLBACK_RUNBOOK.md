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
