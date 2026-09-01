# PHASE 10P — stale social identity-attempt expiry

Status: local implementation for Draft review. No Preview or Production migration apply is part of this change.

## Root cause

Identity-decision liveness was represented by membership in the four-state partial unique index (`upstream_verified`, `recovery_required`, `recovery_pending`, `recovery_verified`). A recovery attempt could pass its `expires_at` while remaining `recovery_pending`; the row therefore continued to own its broker subject and every later verified attempt failed closed as `IDENTITY_DECISION_IN_PROGRESS`.

Adding an `expires_at` predicate only to the competing-row query is insufficient: the unchanged unique index would still reject the replacement row. The stale owner must leave the indexed state set first.

## Frozen resolution

The selected policy is bounded one-time cleanup plus the same on-demand runtime cleanup:

1. Migration apply scans only expired rows already in an identity-live state and terminalizes each through the audited helper. It does not guess a provider identity and deletes no row.
2. A later verified identity decision locates only an exact provider and broker-subject stale owner. The helper terminalizes it before the replacement transition.
3. Row locks precede advisory locks. If a pending recovery challenge exists, recovery-email lock authority is acquired before broker-subject lock authority, preserving the existing recovery → broker order.
4. A genuinely live competitor remains authoritative and the newcomer receives the existing coarse `IDENTITY_DECISION_IN_PROGRESS` fail-closed result.
5. The `oauth_login_attempts_live_subject_unique` index is neither removed nor weakened.

## Terminalization contract

- The stale attempt becomes `expired`, receives coarse reason `expired`, and increments its version.
- A pending `login_decision` recovery verification becomes `expired`. The existing terminal trigger clears the HMAC/key version, destination ciphertext/nonce/key version, OTP MAC/key version, and reserved account ID.
- Only an unsent `reserved` delivery is marked `failed`. Historical `sent` and `failed` delivery rows remain unchanged for abuse-budget and audit purposes.
- A still-live downstream authorization transaction becomes `expired`; its broker-handle digest, raw downstream nonce, and raw downstream state are cleared, `terminal_at` is set, and its version increments.
- Verified/rejected/expired upstream legs and already-terminal attempts or downstream transactions are not resurrected or rewritten.

This boundary does not enable social controls, make provider calls, send email, change Auth/provider/Vercel configuration, or apply a remote migration.
