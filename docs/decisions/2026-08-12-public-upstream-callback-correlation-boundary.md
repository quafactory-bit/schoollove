# PHASE 10O-N — Public upstream callback correlation boundary

## Decision

OAuth `state` is a 32-byte CSPRNG base64url value and the sole browser-visible upstream callback correlation bearer. It contains no UUID, database ID, signed ID token, cookie, session identifier, or storage reference. Only its domain-separated 32-byte digest is persisted.

The service-only callback claim resolves trusted attempt and leg UUIDs only after a matching pending digest is found, the canonical `oauth_login_attempts → upstream_login_legs` lock order is taken, and both rows are re-read. Unknown state performs no mutation. Successful claim clears the digest; replay is then a correlation rejection. Provider mismatch, client binding drift, and expiry commit their terminal/scrubbed outcomes.

The legacy by-ID callback claim remains defined for migration compatibility but has no service, public, anon, or authenticated execute grant. The new state-only RPC is service-only. Callback parsing rejects browser attempt/leg/transaction and provider-hint query parameters.

## Deliberate deferral

No callback route is enabled and all public OIDC surfaces remain hard 404. This phase does not persist downstream Broker authorization client/redirect/PKCE/state/nonce context across account or recovery handling; that authorization-transaction persistence is required before public route enablement.
