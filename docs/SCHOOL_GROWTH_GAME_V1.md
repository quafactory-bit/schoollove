# School Growth Game v1 — implementation and evidence

Status: LOCAL_VERIFIED / FEATURE_PREVIEW_DEPLOYED / REMOTE_MIGRATION_APPROVAL_BLOCKED.
Preview/Production migrations and canonical merges have NOT been applied.

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

## Preservation at implementation checkpoint (historical)

No Preview/Production DB writes, migration applies, canonical deploys, env changes
or user logins have occurred. Feature PR106 deployment is READY. No A/B/C mutations.
People Discovery cap=5, messaging OFF, existing Instagram scope are unchanged.
Schema-only dump and owned disposable containers were removed after local proof.

## Pre-approval release checkpoint — 2026-09-09 (historical)

Source commit: `4bf6a6f527a307b1b5d98abb7b002aacd861ab81`.
Source tree: `a9045ce17192c00ffe9625cfcd4dfc24ffe4277f`.
PR: https://github.com/quafactory-bit/schoollove/pull/106 (Draft, base preview).
Feature deployment: `dpl_CzqcP5J61kn5QhCjmDbHcb7amPau`, READY, exact source SHA.
Real in-app browser renders the new Home. Optional growth is unavailable until
migration46, without breaking school search or account navigation.

Migration LF SHA256: `0963e46d9293e3335ebe6beb66be8d9a9e7e62ec8924659b5a0e7e307bfca359`.
Preview CLI dry-run: exactly `20260909013012_school_growth_game_loop.sql` pending;
no seed, roles or vault updates requested. Actual apply was rejected by automatic
safety review before execution, requiring explicit chat approval for this file and
project. No retry or alternative transport was used. Both remote histories still
45/latest20260908050649, and new growth schema is absent.

Sensitive row-derived fingerprints were also rejected before execution. The
successful replacement check contains only aggregate counts and operational
configuration, not private row values or their fingerprints. It proves counts,
not byte-for-byte private row equality.

| Baseline | Preview | Production |
| --- | ---: | ---: |
| Auth users / identities | 2 / 2 | 3 / 3 |
| Private profiles / memberships / classes | 2 / 2 / 2 | 3 / 3 / 0 |
| Accepted requests / active connections | 1 / 1 | 2 / 2 |
| Notifications / messages | 7 / 0 | 8 / 0 |
| Instagram handles / active permissions / historical permissions | 0 / 0 / 2 | 0 / 0 / 2 |
| People Discovery active / operational cap | 2 / unchanged NULL | 3 / 5 |
| Connected Instagram active members | 2 | 2 |
| Public launch | open | open |

See [72-field release checkpoint](SCHOOL_GROWTH_GAME_RELEASE_CHECKPOINT.md).

## Explicit release resume — Preview migration verified

The user subsequently approved the exact Preview migration and conditional
Production release in chat. CLI apply succeeded once (exit0), history45→46,
version20260909013012 count1; post-apply dry-run pending0. SHA256 is unchanged.
All seven new private tables retain RLS/FORCE and deny anon/authenticated direct
access. Function grants and empty search_path match the approved boundaries.
Existing two membership pairs produced two seen-only ledger rows, zero XP,
one Lv1 state, and zero events/batches/referrals/visits/attributions. Existing
Preview account, relation, notification, Instagram and launch/beta counts and
configuration are unchanged. Canonical Preview and Production release follow
only after their remaining gates pass; earlier blocked checkpoint is historical.

## Production release verified — 2026-09-09

PR106 merged to Preview `2ad27b332bfe10f6b0adfb0fc6cef34626dac421`;
canonical deployment `dpl_8RkSSzokofopGhBNAW6bVZKdyfEF` READY at
preview.schoollove.kr. PR107 merged to main
`f4adbc26d9f2af57a1cecc01353b370eca9631b3`; Production deployment
`dpl_9QaRmEEUCjSrxyk2j2W7qX6wFCNe` READY at www.schoollove.kr.
Both trees are `6f43bdd621eda4f9e1b775283360f127b02b0b90`.

Migration20260909013012 applied exactly once to each environment,45→46,
exact-version count1 and pending0. Seven new tables RLS/FORCE/ACLs and all
new RPC grants match the contract. Preview2/Production3 existing membership
pairs have seen rows with XP0; each environment has one Lv1/XP0 state.
Events/batches/referrals/visits/attributions remain0. Existing accounts,
memberships, class histories, connections, requests, notifications, Instagram
counts, public launchOPEN, People Discovery cap5 and messagingOFF are preserved.

Release-tree targeted31, full1649PASS/4existing skips, TypeScript, lint0errors,
build66static pages, diff and scoped44-file secret-pattern scan passed. Actual
canonical Preview/Production Home and Hub at360/390/412/1280 have no horizontal
overflow. Home shows honest cold-start copy, HubLv1/progress0; existing-session
owner school/share UI observed without creating referrals. Public HTTP Home,
search, login, Hub, OG200; anonymous account growth401, account307. Production
early5xx/error/fatal logs0 and checked-page console errors0.

Remote positive growth/referral writes were deliberately not tested with fake
users; disposable upgrade/atomic/replay/concurrency evidence supplies those
proofs. Physical expiry purge remains a documented follow-up. Full72-field
report: [release report](SCHOOL_GROWTH_GAME_RELEASE_CHECKPOINT.md).
