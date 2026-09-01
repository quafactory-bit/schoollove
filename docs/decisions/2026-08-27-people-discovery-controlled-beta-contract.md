# People-discovery controlled-beta contract

Date: 2026-08-27
Status: approved for local implementation and Draft PR; not activated

## Decision

The original controlled-beta boundary could represent only one immutable feature set: `account_registration` plus `private_profile`. Manually writing flags for people discovery would bypass the snapshot authority, so that is not an acceptable activation path.

Controlled-beta setup now recognizes exactly two order-independent contracts:

- `ACCOUNT_PRIVATE_BETA`: `account_registration`, `private_profile`
- `PEOPLE_DISCOVERY_BETA`: `people_search`, `connection_request`

No subset, superset, duplicate, or mixed pair is valid. In particular, messaging and Instagram are not part of the people-discovery first release.

## Shared safety envelope

Both contracts retain the proven first-beta envelope:

- one exact target school;
- maximum 20 enrolled users;
- exactly 14 days;
- administrator approval and approval waitlist;
- one use per invite and a seven-day invite lifetime;
- mandatory `PRIVACY_EXPOSURE`, `RLS_FAILURE`, and `HEALTH_FAILURE` stop conditions;
- activation creates a paused program and never starts it automatically.

The immutable setup snapshot determines the program contract. Configuration, start, reactivation, server readiness, and effective access require a complete eight-row program flag inventory with only the snapshot pair enabled. A caller cannot switch an activated program from one contract to the other.

## Access and shutdown

People-discovery access still requires an active, non-suspended member in an active, in-window, non-emergency program; an exact snapshot and school binding; the relevant program flag; no user denial; and no global stop. The target of an exact search remains governed by the existing PHASE 10V eligibility rules and does not become a beta member merely by being discoverable.

Disabling `people_search` also denies dependent `connection_request`. This keeps PHASE 10V search, request, reminder, and accept fail-closed. Existing receiver safety actions—decline, not-the-person, block, and report—remain outside this expansion gate.

## Non-activation boundary

PHASE 10X adds only the representable contract and its local/disposable evidence. It does not apply the migration to Preview, create a Preview beta draft/program/snapshot/invite/member, enable any people feature, change external configuration, call a live provider, or mutate Production. Preview remains without a beta program, and messaging and Instagram remain disabled.
