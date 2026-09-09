# Owner live growth — release evidence

Status: OWNER_LIVE_GROWTH_COHERENCE_FIX_COMPLETE / REAL_USER_GROWTH_ACTIVATION_READY / AWAITING_FIRST_GENUINE_USER.
Canonical Preview and Production release verified on 2026-09-09. No genuine new participant; positive remote growth activation is not claimed.

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

## 2026-09-09 historical execution checkpoint (superseded below)

- Source commit: `d5ff74d34f2cc34ad4080712d18dd405079ba02e`.
- Source tree: `890ae079fbf30ac30443be1fa2fa211fc67d3240`.
- Branch: `codex/owner-live-school-growth`; pushed to origin.
- Draft PR: https://github.com/quafactory-bit/schoollove/pull/108 (base preview).
- Feature deployment: `dpl_HshykbQGkuEbqa3N4HJTXtsmPgR6`, READY, exact source SHA.
  https://schoollove-2lk0e2u9o-quafactory-s-projects.vercel.app
- Preview dry-run: exactly migration47 pending, seed/role changes absent.
- The single attempted Preview apply was rejected by the execution safety
  reviewer BEFORE process creation. Reviewer required explicit approval naming
  this exact migration despite the attached phase runbook's migration47 approval.
  No alternate tool/path or retry was used. This is authorization-blocked, not
  an executed/failed or ambiguously applied database migration.
- Final read-only recheck: Preview46 / Production46; every starting aggregate
  and launch/program configuration above unchanged. Growth XP/events/batches/
  referrals/visits/attributions still zero; existing seen ledger2/3 preserved.
- Preview merge0; canonical Preview deploy0; Production PR/merge/deploy0;
  remote migration/data/environment/credential changes0.
- Production main and canonical Preview SHA remain the starting authorities.
- Owner positive UI was checked through local rendering/API tests and disposable
  DB +100/+150 proof, NOT via remote positive user writes. Feature build READY
  does not prove owner RPC integration because Preview still has schema46.
- Disposable container removed by the proof runner; schema-only dump and its
  exact empty temporary directory deleted; no credentials/dump committed.
- Final scoped staged scan19 files/0 findings; working tree clean before this
  documentation-only checkpoint commit. Existing applied migration46 untouched.

At that checkpoint, the next gate was explicit approval for Preview `hukokfyphyrpfouazxhq` to apply
`20260909041329_owner_live_school_growth_projection.sql` exactly once, followed
by the already scoped Preview/Production gates. Do not declare
OWNER_LIVE_GROWTH_COHERENCE_FIX_COMPLETE or REAL_USER_GROWTH_ACTIVATION_READY yet.
Actual genuine-user activation remains deferred by the user's choice.

## Completed release and postflight — 2026-09-09

The user explicitly approved Preview migration47 and continuation under the
phase runbook. Preview succeeded before Production. A subsequent execution
quota interruption was resolved by the user; remote state was re-read before
continuing. PR109 already existed, so no duplicate PR was created.

| Release authority | Preview | Production |
| --- | --- | --- |
| PR | [108](https://github.com/quafactory-bit/schoollove/pull/108) | [109](https://github.com/quafactory-bit/schoollove/pull/109) |
| Base | preview | main |
| Approved PR head | 28db6742393645fd85ce602d8a133c8ff9daae91 | 72cdba1471cb713e4c5c809ceff47947b6a680b2 |
| Squash merge/source SHA | 4e2a9d095447c544696527427d8387debd4cd590 | 5dbba050a250c858a8527b6110bbf0a016549f62 |
| Exact tree | 2ada9fffa23fe96991effb4a50042e6613e69e8e | 2ada9fffa23fe96991effb4a50042e6613e69e8e |
| Deployment | dpl_71UuRkV9rGtjkTL36Ub9wsJCvjGE | dpl_EzbUJBKyqPxjHtWn2LhNxHB6ngZx |
| Deployment status | READY | READY |
| Canonical alias | preview.schoollove.kr | www.schoollove.kr (also schoollove.kr) |
| Migrations before / after | 46 / 47 | 46 / 47 |
| Exact migration version rows | 1 | 1 |
| Dry-run pending before / after | exactly 1 / 0 | exactly 1 / 0 |

Production branch: `codex/production-owner-live-school-growth`, based on old
main `f4adbc26d9f2af57a1cecc01353b370eca9631b3` plus PR108's exact change only.
Both deployments match their canonical source SHA. Migration47 was executed
once per project, before each application deployment, with no repair/retry,
seed, role or Vault change. LF SHA256 remains the authority recorded above.
Branch checkout changed working-copy line endings only; the one migration
was normalized back to its approved LF bytes, with no content diff.

### Schema, permissions and data

- New RPC: STABLE, SECURITY DEFINER, empty search_path; definition MD5
  `89c86ca2c38c6a114d0377085142e8d6` on both projects.
- PUBLIC/anon/service_role execute false; authenticated execute true.
- Seven private growth tables retain RLS and FORCE RLS.
- Null UID returns null. Read-only transactions under the authenticated role
  returned the existing owner's eight-field projection (Lv1/0%, own XP0),
  and null for a nonowned school. Transactions rolled back; no user row writes.
- All eight pre-existing growth/public/award/referral function fingerprints
  match their preflight values. Public school remains Lv1/0%, ranking empty.
- Every metric and configuration in the baseline table above is unchanged,
  except migration count47. Production Auth3/3, profiles/memberships3/3,
  histories0, PDactive3/cap5, IGactive2, accepted2/connections2, notifications8,
  messages0, handles0/active grants0/historical grants2 all preserved.
- Existing membership ledgers remain Preview2/Production3 seen rows, awarded0,
  live XP0; events/batches/referrals/visits/attributions all0. No fake growth,
  new login, principal, invite, membership, class, connection or message.
- Public account remains open; messaging OFF; Connected Instagram scope and
  existing evidence retained. Environment/credential/protection changes0.

### Deployed read-only UI/API evidence

- Existing Preview B session and existing Production session remained usable;
  no new OAuth was initiated. `/account` shows existing-school feedback and
  the owner live progress label at0. Authenticated Home shows the same owner
  live meter and empty public ranking.
- Public School Hub shows the public growth label at0 and the delayed aggregate
  explanation, with no owner-live label. Production actual screenshot reviewed.
- Anonymous Home and School Hub HTTP200; owner growth API HTTP401 with generic
  login-required response, Cache-Control private/no-store and Vary Cookie.
- Preview and Production deployment-filtered error-log queries returned no
  entries. Production scan occurred more than60 seconds after READY; this is
  bounded smoke evidence, not a long-term uptime or load-test claim.
- Remote +100/+150 UI cannot be tested without a new real participant; positive
  values were verified only in the disposable matrix and local rendering tests.
  No share/referral creation control was clicked during remote smoke.

### Validation, residual risks and handoff

- Release branch re-run: targeted28 PASS, TypeScript PASS, full1669 PASS /
  4 existing SKIP, ESLint PASS with86 existing warnings, build PASS.
- Earlier broader targeted51 and deployed-schema disposable proof remain valid
  for the identical runtime tree. Release diff and scoped19-file secret scan PASS.
- Supabase advisor categories match across projects: RLS-no-policy INFO51,
  extension-in-public WARN1, anon SECURITY DEFINER WARN4, authenticated SECURITY
  DEFINER WARN28, leaked-password-protection WARN1. The new authenticated
  SECURITY DEFINER warning is intentional for the membership-checked RPC and
  was reviewed against its narrow output, empty search_path and role tests.
  Advisor results are not claimed to contain zero warnings.
- Historical fresh-chain ordering and expired-referral physical purge remain
  prior follow-ups; neither was modified in this release.
- Prior Production READY deployment `dpl_9QaRmEEUCjSrxyk2j2W7qX6wFCNe` remains
  the previous deployment reference. No rollback was performed; the additive
  read-only RPC is compatible with the previous source.
- This evidence update changes only this report and IMPLEMENTATION_LOG, to be
  committed/pushed on the release branch. It does not alter deployed runtime.

Final classification: OWNER_LIVE_GROWTH_COHERENCE_FIX_COMPLETE;
REAL_USER_GROWTH_ACTIVATION_READY; AWAITING_FIRST_GENUINE_USER.
REFERRAL_PRODUCTION_ORGANIC_PENDING. Real signup/adult consent/school entry
must be performed by the future actual participant; no repeat release approval
is needed for the completed source deployment.
