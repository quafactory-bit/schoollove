# PHASE 10P — social account activation and bound-provisional reauthentication

Status: approved contract implemented locally for Draft review. Remote migration apply and live-provider execution are excluded.

## Launch authority

`public_account_launch_control` is a required singleton. A forward migration may restore a missing row only as `closed` with all three feature flags false and one non-personal audit record. It must preserve one valid row without changing its state or flags, and must fail on malformed or ambiguous rows.

Social account activation requires exactly one `public_account` row whose state is `open`, whose account-registration, private-profile, and school-membership flags are all true, and whose emergency stop timestamp is null. Every comparison is NULL-safe. Authentication remains allowed while closed, but the account and primary identity stay provisional.

## Attempt-derived activation

The completion server supplies only a trusted consumed attempt ID. The database derives its account and exact primary identity, then verifies recovery custody, the shared non-null Auth principal, one matching `auth.users` row, and one unambiguous `auth.identities` mapping for `custom:schoollove-{provider}` whose `provider_id` and `identity_data.sub` both equal the broker subject.

Exact provisional state activates account and identity atomically. Exact active state is idempotent. A non-open or missing launch returns a coarse launch-closed result. Any authority mismatch rejects activation and session cookies are not issued.

## Bound provisional reauthentication

A recovery-verified provisional account already bound to an exact Custom OIDC principal may reauthenticate with its immutable primary provider and broker subject. Under the existing broker-subject lock, the callback requires the exact transaction, attempt, verified leg, subject digest/key, account, identity, user, and unambiguous Auth identity tuple.

Success returns `BOUND_PROVISIONAL_REAUTH_READY`, binds the new attempt to the existing account in `auth_principal_bound`, and follows transaction-bound broker-code issuance. It creates no account, identity, recovery verification, delivery, email, or OTP. Once an exact-open activation has made the tuple active, later same-provider login continues through `EXISTING_PRIMARY`.

All changed public RPCs remain service-role-only. The preserved legacy identity decision implementation is an unexposed private helper with no execute grant.
