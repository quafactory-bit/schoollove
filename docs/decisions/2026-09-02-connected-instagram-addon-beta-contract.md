# Connected Instagram add-on beta contract

## Decision

Connected Instagram selective sharing is an add-on controlled beta, not an expansion of the People Discovery snapshot. The three canonical contracts are exact, order-independent sets:

- `ACCOUNT_PRIVATE_BETA`: `account_registration`, `private_profile`
- `PEOPLE_DISCOVERY_BETA`: `people_search`, `connection_request`
- `CONNECTED_INSTAGRAM_BETA`: `instagram_permission`

Mixed, partial, duplicate, and superset feature sets are invalid. The existing People Discovery contract and its immutable snapshots remain unchanged, and `messaging` remains outside every active contract in this phase.

## Admission boundary

The Connected Instagram program has one school, exactly 14 days, a maximum of 3 users, administrator approval with waitlist, one-use invitations expiring within 7 days, and the mandatory `PRIVACY_EXPOSURE`, `RLS_FAILURE`, and `HEALTH_FAILURE` stop conditions.

It is not an onboarding program. Redeem and approval both require an adult authenticated account, all four required consents, an active private profile, a membership in the program school, an active People Discovery beta membership, and at least one active connection. Admission follows invite → `pending_review` → administrator approval → `active`; it never creates a provisional onboarding claim.

## Access boundary

`instagram_permission` requires an active membership in an exact Connected Instagram snapshot, its enabled program flag, no global stop, and no account restriction. People search and connection request continue to require the People Discovery contract. A user may hold both memberships because `beta_members` uniqueness is scoped to `(program_id, user_id)`.

The existing selective-sharing rules remain authoritative: permission is directional and connection-scoped, the grantor must have an own handle, an ungranted counterpart handle is never returned, revocation is independent, and disconnect/block/report close visibility. Preview database application, feature activation, and Production changes are outside this decision.
