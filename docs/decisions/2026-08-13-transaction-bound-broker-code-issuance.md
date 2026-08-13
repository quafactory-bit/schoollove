# PHASE 10O-P — Transaction-bound broker-code issuance

The durable downstream authorization transaction is the sole authority for the broker code's client ID, exact registered redirect URI, S256 PKCE challenge, nonce, state, attempt, and expiry. A service caller cannot substitute any of those values during code issuance.

Each broker authorization-code row has a mandatory, unique transaction link and a composite foreign key that proves it belongs to the transaction's exact login attempt. The legacy unbound issue RPC remains only as a historical signature and has no service-role execute permission. The transaction-bound RPC is service-only.

Issuance locks transaction, attempt, and verified upstream leg; validates the existing account/principal identity invariants; inserts the linked code; sets the attempt to `broker_code_ready`; consumes the transaction; and scrubs raw downstream nonce/state atomically. The raw nonce is a transient proof used to confirm that an encrypted nonce tuple belongs to the exact frozen transaction; it is never copied into the code ledger. State is response context only, never lookup or issuance authority.

Unique collisions return a coarse rejection without consuming a valid transaction, allowing a new code candidate to retry. A consumed transaction cannot issue again. This is feature-off: no public route, provider traffic, UI, environment, Auth configuration, email, or Production migration action is enabled.

## Restart-safe service context

The same unapplied migration exposes one service-role-only resolver for a trusted OAuth login-attempt UUID. It returns only the frozen transaction identifier, client ID, exact redirect URI, S256 PKCE challenge, downstream nonce, response state, and expiry after locking and validating the authoritative transaction, attempt, and verified upstream leg. It returns no row for unknown, pending, expired, mismatched, or unverified input, and it does not expose a direct private-table read path.

The TypeScript preparation helper receives `auth_time` separately as trusted provider/server-derived input; it is never accepted from a downstream request. Fresh-process acceptance resolves the frozen context and re-prepares nonce-bearing and no-nonce issuance without retaining ephemeral in-process context. The DB verifies transaction state and encrypted nonce tuple consistency, while AES-GCM authentication remains the server crypto boundary rather than a SQL cipher verification claim.
