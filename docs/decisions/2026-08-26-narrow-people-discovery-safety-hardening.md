# PHASE 10V narrow people-discovery safety hardening

Date: 2026-08-26
Status: local/disposable Draft; feature remains disabled

## Decision

PHASE 10V closes the two P0 and eight P1 blockers recorded by PHASE 10U without activating people discovery. The four effective features `people_search`, `connection_request`, `messaging`, and `instagram_permission` remain disabled in Preview. Applying the migration, enabling a feature, marking the PR Ready, merging, or starting Production rollout requires separate approval.

## Exact discovery authority

- Exact search still requires school, graduation year, and exact name. It does not add a list, suggestion, partial/chosung/fuzzy search, profile card, member count, or Instagram surface.
- The authenticated actor must currently own an active membership in the target school. The actor's own graduation year need not equal the target year, preserving same-school senior/junior discovery.
- A successful search exposes only `match_available` and a requester-bound opaque token. Every valid non-match, prior relationship, block, suspension, deletion, duplicate, or existing-connection state is contracted to the same browser-visible unavailable state and neutral copy.
- The target UUID and private identity are never returned. Existing minimum response padding is retained. Search is limited to five attempts per day independently by IP hash and account hash; Production without the configured Redis authority fails closed.

## Current eligibility and atomic rechecks

- Current adult-account eligibility continues to require adult self-attestation, all four required consents, an active private profile, and no safety suspension. Any account-deletion lifecycle other than `rejected` makes the account ineligible.
- Search excludes an ineligible or deletion-pending actor or target.
- Request creation locks and consumes the requester-bound token under the existing single-use contract, resolves the target membership's current school, and rechecks that the actor still owns that same school's membership. Lost authority fails closed without a request, notification, connection, or reusable token.
- Acceptance atomically rechecks the sender and receiver eligibility, deletion/restriction state, private account validity, public emergency state, and the receiver's effective discovery/request features. Failure creates no connection and leaves receiver safety alternatives available.

## Emergency and feature-stop behavior

`emergency_stopped` dominates public and beta authority at page/API and database boundaries. It prevents token issue, request creation, reminder, and acceptance. The service-role mutation functions enforce the same effective feature/emergency contract instead of relying on the browser.

Stopping discovery does not remove existing-object safety access. An authenticated receiver may still read the minimum pending-request fields needed to decline, mark not-the-person, block, or report, and may perform those actions even when discovery features are disabled or public emergency is active. Existing authenticated participant reads, disconnect, block, and report remain safety-preserving. Reminder remains a new contact action and is stopped with discovery.

## Greeting and Instagram boundaries

The initial greeting remains immutable, limited to 200 characters, and available once. Natural self-identification remains allowed. TypeScript NFKC validation and PostgreSQL 17 `normalize(..., NFKC)` reject URLs, email, ordinary and spaced phone forms, handles including punctuated handles, provider phrases including spaced forms, domain `dot` obfuscation, full-width forms, and zero-width formatting. The same practical corpus is enforced in both authorities.

Instagram GET now requires `instagram_permission` before any connection/private-profile lookup. POST and DELETE retain their feature and participant authority. Instagram and messaging remain disabled and no discovery CTA exposes either feature.

## Database and release boundary

Migration `20260826061123_people_discovery_safety_hardening.sql` replaces only these existing functions:

- `public.connection_text_is_safe`
- `public.is_current_adult_account`
- `public.find_exact_private_profile_match`
- `public.create_connection_request`
- `public.remind_connection_request`
- `public.respond_connection_request`

It creates no table, column, function, route, identity authority, telemetry event, or provider. Direct execution remains denied to `anon` and `authenticated`; the existing service-role execution boundary is preserved. Historical migrations are unchanged.

No PHASE 10V migration is applied to Preview in this phase. Preview DB writes, feature changes, external configuration mutations, live provider calls, email/OTP sends, and Production mutations remain zero.
