# Owner live growth coherence

Authority: SCHOOLLOVE_REAL_USER_GROWTH_ACTIVATION_V1, 2026-09-09.
The user confirmed that no genuine new participant is available; this phase
ends after the coherence fix is released and verified. No referral is issued.

## Projection split

Owner account feedback and the authenticated Home school cards use one
owner-authorized, statement-consistent RPC snapshot of private growth state
and the caller's own contribution. Public Home ranking, School Hub, OG and
anonymous RPC continue to use the unchanged ten-contributor, next-UTC-day
projection. Levels retain the existing threshold curve and never decrement.

The narrow owner result contains schoolId, schoolName, slug, level, progress,
nearLevelUp, lastLevelUp and ownContributionXp only. It does not expose live
total XP, participant counts, other identities, school history or referrers.
An authenticated principal must currently own a membership for that school;
missing UID/nonmember/cross-school returns null. No service-role fallback.
Private read responses are never cached. A failed live read must not fall back
to the delayed public level or display a stale result from another school.

Owner live levels must not accidentally leave the private surface in share
copy: referral share text carries school name and a generic invitation, not
the private live level. Public OG remains batched. No polling, analytics or
additional entitlement is introduced. Existing growth writes and public RPC
definitions remain byte-identical; migration47 adds one read-only function.

## Rollout / stop

Local privacy/UI tests and disposable deployed-schema upgrade first; Preview
migration once, source PR/merge/deploy and read-only checks next. Production
uses the same source delta after Preview passes. The additive RPC is installed
and verified before the Production app needs it, avoiding a broken-read window.
No existing A/B/C rows, launch, capacity, flags or credentials change. Stop on
ambiguous migration status or unexpected baseline drift. No genuine signup,
school data or referral conversion is fabricated to satisfy a PASS condition.
