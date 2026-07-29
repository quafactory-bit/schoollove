# Limited beta daily runbook

At the same KST time each day:

1. Check health, cron/outbox failures, incidents, RLS drift, and migration history.
2. Review approvals, onboarding failures, reports/blocks, deletion requests, feedback, advertiser reviews, payment reviews, and refunds.
3. Export `/api/admin/beta/report?format=csv`; keep aggregate counts, neutralize spreadsheet formulas, and mask segments below 10.
4. Compare today and seven days for invite, redeem, approval, onboarding-ready, school, search, greeting, accept, first reply, report/block, advertiser, payment, active-ad, task, cron, and outbox metrics.
5. Assign due times and owners. Resolve with a safe reason code.
6. Reassess stop conditions and readiness. `launch_candidate` remains a human decision label.

Never contact users automatically or enable live payment.
