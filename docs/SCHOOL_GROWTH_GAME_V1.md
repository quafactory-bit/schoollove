# School Growth Game v1 — implementation and evidence

Status: LOCAL_VERIFIED. Preview/Production NOT YET APPLIED.

## Authority and legacy audit

Base Preview `9871bd307f9855e3745e4e814203c83f4dc4a8d0`, Production
`8b2d0fd0dff426fd758696b1e434688aa293fdd7`, common tree
`1b9c6a7be4df2c5ab5ac5bb4a6ae2754021a2386`. Both remote histories read as 45.
Branch: `codex/school-growth-game-loop-v1`.

`getSchoolGrowthSnapshot`, `school_growth_ranking_v1`, `TodayGrowthStrip`,
legacy growth panels and level sync depend on public profile counts. New Home
and School Hub do not call these. SchoolCard's latent person-count rendering
is removed. Legacy schema/functions stay intact; no historical migration edit.

## Contract

See [decision](decisions/2026-09-09-school-growth-game-loop-v2.md).
First-ever principal/school membership: 100 XP; valid new-principal referral:
50 bonus. Everything else: zero. Ledger uniqueness and a membership INSERT
trigger cover all official creation paths. Membership plus growth are atomic.
Existing memberships seed seen rows with zero XP; delete/re-add cannot farm XP.

Existing curve: first 1/2/3/5/10 contributions (100/200/300/500/1000 XP)
produce levels 1/2/3/4/7. The curve and historical level code are unchanged.

Public projection: completed batches of >=10 distinct contributing principals,
published at the next UTC day boundary. Live XP, individual timestamps and
principal identifiers never appear publicly. Weekly rank uses published batches
in the last seven days. Public empty/unavailable states are distinct. The initial
three Production memberships must contribute zero, not create fake ranking.

Referral tokens are 256-bit random hex, hashed in the database, seven-day expiry.
The shared token is a fragment, removed on landing before POST attribution.
An HttpOnly cookie carries an independent random visit proof through Google
login. Only a principal created after that visit can bind it; existing users,
self-referrals, wrong-school and expired referrals cannot receive the bonus.
One principal can receive only one referral award, enforced by a unique index.
Creation: five links/day/owner; landing: 10 requests/10 min/IP, fail-closed in
Production; at most 100 visit proofs/link. No token-bearing analytics events.

## Verification so far

- Actual Preview schema-only (public/private/auth; no row data) restored into
  disposable Supabase PostgreSQL 17.6.1.143. Migration46 applied successfully.
- First award, deletion/re-add, other-school award, referral +150, replay,
  wrong school, expiry, visit-owner binding, delayed public batch, sanitized
  response, RLS/FORCE RLS, direct privilege denial: PASS.
- Exception after the growth trigger rolls back both membership and XP: PASS.
- Two concurrent official school saves (same owner/school, distinct years):
  both committed, exactly one ledger award and 100 XP: PASS.
- Separate actual 45→46 restore with pre-existing synthetic membership:
  seen=1, XP=0, events=0, re-add remains zero: PASS.
- TypeScript PASS. Final full Vitest 1,649 PASS / 4 existing skipped;
  final Home/Hub rendering matrix 13 PASS, API 8 PASS, growth unit 10 PASS.
- ESLint: 0 errors / 86 existing warnings.
- Production build PASS, 66 routes generated. Korean dynamic OG HTTP200 and
  1200x630 rendering inspected; no private data. Home 360/390/412/1280 and Hub
  360/390/412/1280 have no horizontal overflow. Home/Hub empty, unavailable,
  ranking one/top-five, milestone, launch and capability boundaries rendered
  by SSR tests. Canonical deployed states remain to be checked.

Today-growth shows actual published level-up schools dated today in KST; no
today-membership counts or individual events are exposed. Growth Moments use
published level-up dates. Neither section invents items in a cold start.

## Remaining operational considerations

Seven-day expiry denies stale referral use but does not physically purge rows.
Raw tokens are never stored. Expired hashes and attribution references remain
private; an audited retention/purge policy is a follow-up, not an implemented
cleanup job. Growth pseudonyms must remain for no-double-award/monotonic history.
No fake users were created remotely to demonstrate populated ranking. Positive
award/referral tests are confined to disposable databases.

## Preservation

No Preview/Production DB writes, migration applies, deploys, env changes or user
logins have occurred in this implementation phase so far. No A/B/C mutations.
People Discovery cap=5, messaging OFF, existing Instagram scope are unchanged.
Schema-only dump and disposable containers must be removed after final local
proof. Remote release evidence must replace the pending status above only after
actual gate completion.
