# Owner live growth — release evidence

Status: LOCAL_VERIFIED; remote rollout pending. No genuine new participant.

## Authority

- Production starting main: `f4adbc26d9f2af57a1cecc01353b370eca9631b3`.
- Preview starting SHA: `2ad27b332bfe10f6b0adfb0fc6cef34626dac421`.
- Shared starting tree: `6f43bdd621eda4f9e1b775283360f127b02b0b90`.
- Both starting migration histories: 46.
- Additive migration: `20260909041329_owner_live_school_growth_projection.sql`.
- LF SHA256: `f6877232e1fbcbfb6f9962de5d53bcd97124b46dc9bafd51b705d660222e9120`.

## Defect and fix

Account growth paired immediate own XP with delayed public level/progress.
One authenticated RPC now reads live school state and own contribution in a
single statement. Missing UID or nonmember/cross-school returns null. Explicit
PUBLIC/anon/service execute denial; authenticated execute; empty search_path;
STABLE SECURITY DEFINER with current membership ownership predicate. Seven
private growth tables retain RLS/FORCE; no new tables/policies or data writes.

Exact returned fields: schoolId, schoolName, slug, level, progress, nearLevelUp,
lastLevelUp, ownContributionXp. No live total XP, counts, other users or history.
Account API strips unknown fields, matches requested school and never falls
back to public data. Responses are private/no-store (including errors).
Owner Home cards are session-scoped, no shared cache; late account fetches are
discarded. Public Home ranking, Hub and OG remain unchanged delayed aggregates.
Share text no longer serializes a private live level.

## Local verification

- Targeted growth/API/Home/Hub/owner rendering: 51 PASS.
- Full Vitest: 1669 PASS, 4 existing SKIP; 203 passed files / 3 skipped.
- TypeScript PASS; ESLint 0 errors / 86 existing warnings.
- Production build: PASS (66 generated pages; Home/account/growth are dynamic).
- Scoped secret-pattern scan: 17 implementation files, 0 findings; diff PASS.
- Deployed Preview46 schema-only clone →47 in disposable PostgreSQL: PASS.
  89 public/private tables, 900 columns unchanged; functions221→222; all
  pre-existing definitions unchanged. Synthetic rows existed only locally.
- +100 →Lv1/70%; +150 →Lv2/7%; existing same-school owner sees same live state
  but own XP0. Public remains Lv1/0%, ranking[], batches0. Authenticated actual
  role/nullUID/nonmember/cross-school/owner-removal and anon denial PASS.
- Existing growth/referral/replay/cohort/publication/atomic rollback matrix PASS.
- Fresh migration-chain historical ordering defect remains outside this change;
  deployed schema46, not a repaired historical chain, is upgrade authority.

## Starting remote baseline (safe aggregates only)

| Metric | Preview | Production |
| --- | ---: | ---: |
| Auth users / identities | 2/2 | 3/3 |
| Profiles / memberships / class histories | 2/2/2 | 3/3/0 |
| People Discovery active / cap | 2 / unchanged null | 3 / 5 |
| Connected Instagram active | 2 | 2 |
| Accepted requests / active connections | 1/1 | 2/2 |
| Notifications / messages | 7/0 | 8/0 |
| Instagram handles / active permissions / historical permissions | 0/0/2 | 0/0/2 |
| Growth contribution rows / awarded rows / live XP | 2/0/0 | 3/0/0 |
| Events / batches / referrals / visits / attributions | 0/0/0/0/0 | 0/0/0/0/0 |

Both launches open; People flags connection_request+people_search; messaging
OFF; existing Instagram-only program scope unchanged. No A/B/C mutation.

## Activation scope

Genuine participant used: NO (user confirmed unavailable). Referral path: NO.
Production positive +100/+150: NOT RUN; no fourth principal, profile, membership,
referral, visit or attribution created. Do not report genuine activation PASS.
Referral organic positive remains pending, not a coherence-release blocker.
Used/expired referral physical purge remains the existing P2 follow-up.
