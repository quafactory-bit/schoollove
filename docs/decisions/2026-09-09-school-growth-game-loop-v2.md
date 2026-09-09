# School growth game loop v2 — implementation decision

Status: APPROVED SCOPE / implementation in progress; not a deployment claim.

Authority: SCHOOLLOVE_SCHOOL_GROWTH_GAME_LOOP_V1 user runbook, 2026-09-09.
Baseline: Preview 9871bd307f9855e3745e4e814203c83f4dc4a8d0 and Production
8b2d0fd0dff426fd758696b1e434688aa293fdd7 share tree
1b9c6a7be4df2c5ab5ac5bb4a6ae2754021a2386; both migration histories contain 45.

## Supersession and boundaries

The frozen growth intent (school-level growth, cumulative levels, recent-growth
ranking, links to school hubs) remains. Legacy `public.profiles` visible counts,
school_growth_ranking_v1 and schools.current_level are NOT the new authority.
They are retained for historical compatibility, not read by the new growth UI.
The existing levelPolicy curve is preserved: threshold(1)=0, otherwise
round(50*level^1.5). No user-level rankings, public people lists or fake activity.

Public account launch remains open subject to its existing emergency gate.
People Discovery stays controlled beta with operational cap 5; growth/referral
does not grant beta access or unlock messaging/Instagram. Existing A/B/C,
relationships, notifications and Instagram scope are preserved.

## Contribution authority and atomicity

Only first-ever user/school membership earns 100 XP. A validated referral adds
50 XP to that school, at most once per new referred principal. Login, sharing,
search, class edits, connection activity and profile edits earn zero.

A membership INSERT trigger covers every official membership creation path.
An immutable user/school seen ledger is seeded from existing memberships with
zero XP. A second graduation year, deletion/re-addition or concurrent retry
cannot earn again. Existing users are not retroactively awarded. No hardcoded
fixture IDs. Growth is cumulative and is not decremented by owner deletion.

Membership, contribution, referral consumption, growth state and level-up event
commit atomically. Any unexpected growth write failure rolls back the entire
membership transaction, never leaves partial rewards; the user sees the existing
safe save failure and can retry. No network calls inside the transaction.
School row locking serializes awards; uniqueness constraints enforce replay
protection independently of application code.

## Privacy-safe public projection

Exact XP can reveal private membership changes (100 XP per person). Therefore
public RPCs never expose the live ledger, live total XP, contributor count or
individual membership timestamps. Publication uses completed daily boundaries
and batches of at least 10 distinct new contributing principals per school.
Unpublished growth remains pending; no fabricated replacement events. Public
level/progress/ranking come only from that published projection, consistently
across Home, school hub and OG. Published weekly scores are based on published
batches in the rolling seven-day window, not a real-time membership feed.

Below the privacy threshold the public school stays at its last published level
(initially Lv.1) and explains that growth is aggregated before publication.
Owner-only feedback confirms the owner's own contribution without revealing
another person's contribution. This intentionally trades immediate public
movement for privacy in a small initial cohort. No public exact-member counts,
referrer identity, name, graduation year, grade/class or Instagram fields.

## Referral and auth

School growth referral is separate from beta invitation. Only a current school
member may create a rate-limited opaque seven-day link. Store a hash, not the raw
token. The token is a URL fragment, never an HTTP query/path. A landing removes
the fragment and POSTs the token to establish an HttpOnly, SameSite cookie;
the response has no-referrer/no-store and noindex headers.
Do not embed the token in OG, analytics, login `next`, logs or localStorage.

Attribution may survive Google login but is bound server-side before membership
creation, only to a newly created Auth principal after the link visit. It cannot
overwrite a bound attribution. Require a different inviter, unexpired link,
current same-school inviter membership, explicit referred-user school choice,
first school contribution and a global single referral reward. Invalid, expired,
self or wrong-school referral grants no bonus and does not block ordinary
onboarding. No automatic school registration or beta enrollment.

## UI and failure behavior

Visual thesis: clean school-yearbook typography with a restrained game HUD,
indigo progress and generous white space; school growth is the primary task.
Home opens with “우리 학교는 지금 몇 레벨일까?” and school finding. Existing
owner school cards, real weekly ranking and aggregated milestones follow.
Empty and unavailable states differ. No invented rankings or progress. School
hubs and account cards reuse one growth contract. Core school search/account
navigation remains available when optional growth reads fail.

## Verification / rollout

Local deterministic tests and disposable deployed-schema 45 upgrade precede
Preview migration, source merge and canonical Preview verification. Production
release contains only the approved change after Preview passes. Production
A/B/C smoke is read-only; no artificial reward, referral conversion, new user
or membership mutation. Record actual test/release evidence separately.
