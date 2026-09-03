# Connected Instagram owner handle management

## Decision

The Connected Instagram add-on needs a narrow owner-write path for the private Instagram handle. Production keeps the public account launch closed, and the add-on must not inherit `private_profile`, change the existing Connected Instagram feature set, or reopen general profile editing.

An authenticated owner with active `instagram_permission` access may set or replace only their existing private profile's `instagram_handle`. The write derives the owner from `auth.uid()`, accepts no user or profile identifier, normalizes and validates the handle, and leaves display name, introduction, photo, visibility, status, school memberships, and grade/class history unchanged.

Clearing the handle remains available to the authenticated owner even after the add-on access is stopped or expires. This is a privacy-removal boundary, not continued feature access. Creating a profile through this path is forbidden.

## API and database boundary

`PATCH /api/account/instagram` accepts exactly `{ instagram_handle: string | null }` and returns only a coarse success result. It calls one owner-safe RPC. The RPC uses a fixed empty search path, locks the owner's existing profile, requires active Connected Instagram access for non-null values, and updates only the handle and update timestamp.

Function execution is revoked from `PUBLIC` and `anon`, granted only to `authenticated` and `service_role`, and the function still requires a non-null `auth.uid()`. Direct authenticated table writes remain revoked. No public launch, feature flag, membership, connection, message, permission, or profile field other than the owner handle is changed by this decision.

Production migration application, Preview application, commit, push, merge, and deployment require separate approval.
