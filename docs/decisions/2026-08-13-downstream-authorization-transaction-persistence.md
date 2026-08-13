# PHASE 10O-O — Downstream Broker authorization transaction persistence

The private transaction ID is never browser authority. A server-created 256-bit opaque broker handle is returned only as future continuity material; the database stores only its domain-separated SHA-256 digest. Claiming that digest resolves the trusted private transaction ID once and clears the digest. Unknown or replayed handles do not mutate another row.

At creation, the exact client ID, registered redirect URI, `code` response contract, normalized requested scopes, S256 challenge/method, optional downstream nonce, optional downstream state, expiry, and attempt binding are immutable. Later upstream binding accepts only a service-held transaction ID returned by a prior handle claim and can attach only the same transaction's pending upstream leg.

The table contains no provider token, raw provider code, PKCE verifier, provider profile, email, IP, user agent, or credential. It is RLS and FORCE RLS with all direct table grants revoked. The three SECURITY DEFINER RPCs use an empty search path, revoke PUBLIC/anon/authenticated, and grant service_role only. This phase adds no public endpoint, code issuance, token exchange, login UI, provider traffic, or Production migration application.
