# PHASE 10O-G — attempt-first social account decision

## Decision

Every new or cross-provider social login begins as a durable, safe-id-only login
attempt. Recovery verification precedes new service-account creation. A verified
recovery-email match never attaches another provider: it returns only
`USE_PRIMARY_PROVIDER` and the retained account's primary provider. A new Auth
principal may be bound only after the database has made the recovery-backed
account decision.

`private.oauth_login_attempts` stores only a safe attempt id, provider, opaque
broker subject/digest/key version, coarse state/outcome, timestamps, version,
and optional private account reference. It stores no raw upstream subject,
email, recovery material, OTP, provider token, authorization code, callback,
or profile data. All transitions use service-only `SECURITY DEFINER` RPCs;
RLS and FORCE RLS apply and no direct table grant exists for PUBLIC, anon,
authenticated, or service_role.

Existing primary identity resolution is recovery-free and creates nothing. A
cross-provider or same-provider-different-subject recovery match is terminal:
it does not create an account, registry row, Auth principal, broker code, or
provider link. Only a verified no-match creates one provisional account and
one provisional primary registry identity atomically. The former direct
`create_provisional_social_account` service execute grant is retired.

## Feature-off scope

This is a forward migration and dark server-domain work only. It adds no public
OAuth/OIDC/recovery HTTP route, login UI or middleware change, provider call,
email/OTP sender, Auth user creation, Custom OIDC configuration, environment
change, Production apply, or launch-state change.
