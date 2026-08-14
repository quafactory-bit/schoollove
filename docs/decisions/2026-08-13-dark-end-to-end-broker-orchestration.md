# PHASE 10O-Q — Dark end-to-end broker orchestration

## Current acceptance status: IN PROGRESS

PHASE 10O-Q composes the existing durable dark broker boundaries without
activating a public endpoint, adding a migration, or changing Production.
The HTTP issuer and orchestration path share one downstream request validator:
a registered client fixes provider, exact redirect URI, S256 PKCE challenge,
normalized scopes, exact response state, and optional nonce.

## Browser-bound continuation correction

The broker handle is intentionally a high-entropy bearer browser-continuity
credential. A different Node process using the legitimate handle is therefore
not a security violation: process identity, PID, backend PID, IP address, and
User-Agent are not browser authorization boundaries. The initial Q acceptance
model treated that restart-safe behavior as a failure; that interpretation was
corrected before adding a process binding.

Q instead requires a second independently generated 256-bit base64url browser
binding. The application stores no raw browser binding, cookie/session row, or
new database column. It derives the existing 32-byte
`broker_handle_digest` from framed handle and binding values under the dedicated
`schoollove:downstream-authorization-browser-bound-handle:v1` domain. The
legacy handle-only digest remains unchanged for completed O contracts.

The raw browser binding is never logged, persisted, included in a provider URL,
downstream state, redirect URI, form body, or environment variable. In Q it
travels only via parent/child IPC as the dark-harness equivalent of future
HttpOnly/Secure browser session material. The Q continuation path fails closed
when it is missing or malformed; it never falls back to handle-only correlation.

The resulting two-part continuation supports restart and horizontal scaling:
a fresh process with A's handle and A's binding can continue A. A handle paired
with B's independent binding, or a handle alone, rejects before a matching DB
claim and does not mutate either transaction. Both legitimate A and B sessions
remain usable after those attacks.

## Scope

This phase remains dark-only: no migration, public OAuth/callback route, social
UI, provider request, credential, environment, Auth user, email, launch, or
Production action is authorized. `auth_time` remains provider/server-derived
input to final code preparation, never browser authority.
