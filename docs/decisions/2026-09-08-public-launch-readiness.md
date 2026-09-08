# Public account launch readiness and controlled expansion

Status: APPROVED SCOPE / AUDIT IN PROGRESS — NOT A LAUNCH APPROVAL RESULT

Authority: user runbook SCHOOLLOVE_PUBLIC_LAUNCH_READINESS_AND_EXPANSION,
2026-09-08. Its conditional release/open authority supersedes earlier per-action
approval requirements only within this phase. All hard-stop conditions remain.

Starting main `a3a2ba2bfa622ca044fd5c94912f236f497aa00f`, Preview
`e90a3a33dd4b57380ca9b6acba44c7265614e5f9`, common tree
`257689e6e747dd24ad0f5910304aa8f10dd54485`. Production migration count 44,
launch closed. Read-only baseline: Auth 3/3, profiles/memberships 3/3,
class histories 0, accepted requests/connections 2/2, notifications 8,
messages/active Instagram grants/live unused match tokens 0/0/0.

## Decisions and guardrails

- Separate public owner-only account onboarding from People Discovery enrollment.
  Opening account registration must not grant search, requests, messaging, or
  Instagram. Existing A/B/C and both connections are preserved.
- Keep exact-name matching, optional owner-private class history, rate limits,
  opaque matches, no public roster, and no raw search persistence.
- No fourth test principal. Reuse the completed C first-login evidence and test
  changed launch boundaries in a disposable database; label component evidence
  separately from any real Google/browser observation.
- No broad redesign or historical migration edits. Implement only evidenced
  P0/P1 defects. Do not claim that configuration booleans prove a live flow.
- `ready` is the existing immutable-readiness gate, not an additional user cohort.
  `internal_test` enables owner writes, not public registration. Use existing
  audited state transitions; never directly UPDATE the Production launch row.
- Public launch remains closed until every required launch gate passes.
  Rollback is a feature/launch stop, never removal of accounts or relationships.

## Initial findings (not yet exhaustive)

| Severity | Evidence | Required disposition |
|---|---|---|
| P1 | AccountClient renders an invite-token form before account setup even for an open, non-beta account. | Make optional discovery enrollment distinct from ordinary account onboarding. |
| P1 | Consent and privacy/terms copy still says no people search / email authentication despite Google-only, private exact matching and connection notifications. | Correct factual statements without changing privacy authority or silently resetting existing consent. |
| P1 | ConnectionsClient treats failed reads as empty feeds and uses reply/chat labels when messaging is disabled. | Explicit safe loading/error states and capability-neutral navigation. |
| P0 candidate | Admin public-account deletion does not call social revocation/cleanup preparation, while active private/social rows require a non-null Auth binding. | Reproduce only in disposable DB; never try deletion on A/B/C. |
| P0 candidate | Broker code consumption does not consult the launch emergency/registration state before minting the downstream identity. | Verify the stop boundary in isolation; preserve existing returning-account access when merely closed. |
| P1 candidate | Public readiness evidence is pinned to an old migration and `auth_smtp` terminology; operational 3-person cap is not the snapshot's enforced 20-person ceiling. | Establish truthful evidence and explicit operator authority; do not call a documentation cap a DB hard limit. |

Completed product phases are reused, not re-audited in full. Changes and actual
validation results will be recorded in the final report, including any NO_GO.
