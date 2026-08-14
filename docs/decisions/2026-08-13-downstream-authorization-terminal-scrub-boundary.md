# PHASE 10O-R — Downstream authorization terminal scrub boundary

## Decision

Any durable downstream authorization transaction that is terminal (`expired`, `rejected`, or `consumed`) retains neither raw downstream nonce nor raw downstream state. This is a structural database invariant, not an application convention.

The R migration fails closed rather than rewriting pre-existing violating rows. It updates provider-failure, identity-record failure, and state-only callback-correlation terminal paths to lock in transaction → attempt → upstream-leg order and terminalize the exact bound transaction atomically. Handle-claim and upstream-leg-bind expiry also scrub the raw context.

Successful upstream verification remains `upstream_bound` and intentionally retains the context until the already-approved P issuance path atomically consumes and scrubs it. No public OAuth route, provider call, credential, email, Auth configuration, login UI, or launch state is enabled by this decision.
