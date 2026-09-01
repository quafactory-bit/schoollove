# Grade/class history foundation

Date: 2026-08-27

Status: approved for local implementation and Draft PR; not applied to Preview

## Decision

A private school membership continues to represent exactly one school and one graduation year. The legacy single `class_number` cannot represent a person's different class in each grade, and adding one `grade_number` to that same row would still represent only one grade/class pair. We therefore store optional K12 grade/class history as owner-private child rows beneath the membership.

Each grade can appear at most once per membership. Elementary schools accept grades 1 through 6; middle and high schools accept grades 1 through 3. University and college memberships do not collect grade/class history in this phase. School type is resolved from `public.schools` at the database boundary and is never trusted from browser input.

## Write and privacy boundary

The owner-safe `add_own_school_membership_with_class_history` RPC derives the authenticated owner and private profile, creates the parent membership with legacy `class_number = NULL`, and creates all supplied child rows in one transaction. Invalid or partially invalid child input leaves no parent membership behind.

`profile_school_class_histories` has RLS and FORCE RLS. Authenticated users may select only their own rows and have no direct insert, update, or delete grant. The composite parent key guarantees that every child owner equals the membership owner. Membership and profile deletion cascade to the child rows.

## Compatibility and deferred scope

The legacy parent `class_number` column and existing values remain intact. No value is backfilled because a historical class number has no trustworthy grade authority; a NOT VALID constraint preserves old rows while requiring new parent writes to store NULL.

School limits still count parent memberships, not child history rows. Owner data export includes the child rows nested under the relevant membership. Public school pages, public analytics, people lists, and the existing people-discovery match contract of school + graduation year + exact name remain unchanged. Grade/class matching is deferred to a separately reviewed phase.

No Preview migration, account onboarding, beta invite/member, people search, external configuration, or Production mutation is authorized by this decision.
