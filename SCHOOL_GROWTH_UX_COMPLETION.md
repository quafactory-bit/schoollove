# School growth UX completion — 2026-09-09

## Authority and scope

User-approved `SCHOOLLOVE_GROWTH_UX_COMPLETION_V1_ASTRA.md`; source-only release.
Feature branch: `codex/school-growth-ux-completion`.
Initial Preview `4e2a9d095447c544696527427d8387debd4cd590`; Production
`5dbba050a250c858a8527b6110bbf0a016549f62`; both tree
`2ada9fffa23fe96991effb4a50042e6613e69e8e`. Starting worktree clean.

## Five changes / engineering gates

| Area | Before | After |
|---|---|---|
| Search | Independent CTA discarded input | One form, current query, IME-safe Enter, candidate keyboard/click, dedupe and retry |
| School continuity | Generic account link | Public slug candidate, <=30-minute same-tab TTL, public revalidation, explicit confirmation/save; no inferred year/class |
| Empty growth | Mostly waiting text | Register/check/share three-step explanation and school-search action; unchanged conditional +100/+50 rules, no invented participation |
| Hierarchy | Forced global text color, narrow Hub, completed setup first | Semantic colors, wider Hub, next-level/projection labels, My Schools first; management/delete retained |
| Share | Prepare/network then native or URL fallback | Preview first (zero issuance), explicit prepare once, reuse/expiry, native/cancel/text+link/link-only/manual alternatives |

Selection stores only public slug/expiry. On authenticated account arrival it is
consumed from storage and retained only in same-owner memory; reload or identity
change requires safe manual reselection. Existing input cannot be overwritten.
No consent is auto-checked. Public resolver whitelist: school id/slug/name/type/
region only. New GET does not alter school-search/owner API or database contracts.

Shared payload contains public school name/URL/service copy, not owner-live XP,
level, person name, graduation year/class or identifiers. Referral is never
issued by preview open. Real referral issuance and external sharing were not run.
Connection changes are labels only, not request/accept/notification behavior.

## Evidence and limits

Artifacts (ignored, local only): `.local/growth-ux/before/`, `after/`,
`functional.json`, `visual.json`, `vitest.json`, `journey-share.png`.
Absolute artifact root on operator machine:
`C:/Users/박완 태블릿/Downloads/schoollove/.local/growth-ux/`.

Before: actual canonical React at initial Preview source, 32 captures, routes
Home/search/Hub/login/onboarding/new account/completed account/connections,
360x800,390x844,412x915,1280x900. The original harness omitted desktop root nav;
final After harness mounts unchanged DesktopNav as well as unchanged TabBar.
Compare private desktop content accordingly, not as a claimed new-nav change.
Share preview did not exist Before; the corresponding old share button appears
in account/Hub Before. No screenshot contains an issued raw referral token.

After: same actual React pages with synthetic local data/network mocks; external
requests blocked. Full mocked journey traverses input → results → Hub → login
screen → simulated return → school confirmation → explicit mock owner save →
My Schools → preview. It does not prove live OAuth or genuine signup. Google,
eligibility/consent state, writes, native share and clipboard use local mocks.
Chromium desktop executable in responsive viewports, not physical iOS/Safari.
200% CSS enlargement is separately labelled, not browser-UI zoom certification.
No measured conversion/fun/user research improvement is claimed.

Authenticated live account/onboarding/share mutation checks are DEFERRED unless
explicitly recorded in the release postflight below. This is permitted by the
runbook; actual local React and public live smoke are distinct gates.

## Validation

- `node scripts/growth-ux/check.mjs`: real React mocked interaction matrix.
- `node scripts/growth-ux/browser.mjs after`: four-viewport screenshot matrix.
- `node scripts/growth-ux/visual.mjs`: dialog containment/focus/Escape, dark CTA
  computed color/contrast, no issue-on-open, enlargement.
- Targeted policy/resolver/growth/search: 35 passed; presentation/privacy
  regression: 34 passed.
- Full Vitest: 1,682 passed / 4 existing skipped, zero failures; TypeScript and
  Production build passed. Final-source rerun recorded in release postflight.
- Final-source full Vitest 1,682 PASS / 4 SKIP; typecheck PASS; build PASS
  (67 static generation entries). ESLint 0 errors / 84 existing warnings.
- Four-viewport After: 32 page captures, 4 share previews and 4 viewport Home
  captures, no horizontal overflow. Dialog inside viewport, keyboard focus
  trapped and Escape restores trigger. Search CTA 48px and computed white on
  rgb(52,72,197): contrast 7.2937:1. CSS 200% enlargement passes separately.
- `git diff --check`; `node scripts/school-growth/scan-changes.mjs`: zero findings.
- A prior full run hit the existing randomized crypto tamper-test edge case
  (setting an IV byte to zero can be a no-op). Auth runtime/test untouched;
  dedicated rerun and full rerun passed. This is not claimed as a UX auth fix.

## Read-only remote baseline

Both migration version lists contain the same existing 47 entries through
20260909041329. Compare local 47 filenames for pending0; no apply/db push.
Read-only comparison completed: local47 / Preview47 / Production47; pending0,
unexpected0 for both environments. Production growth baseline: contributions3,
awarded0, XP0, referral0, visits0, events0.

| Aggregate | Preview | Production |
|---|---:|---:|
| Auth users / identities | 2/2 | 3/3 |
| Private profiles / memberships / class histories | 2/2/2 | 3/3/0 |
| Accepted requests / active connections | 1/1 | 2/2 |
| Messages / notifications | 0/7 | 0/8 |
| Instagram handles / active grants / historical grants | 0/0/2 | 0/0/2 |
| People Discovery active members | 2 | 3 |
| Connected Instagram active members | 2 | 2 |

Production People Discovery cap5; ON people_search/connection_request only.
Connected Instagram scope unchanged; Messaging OFF. Public Account open with
existing registration/profile/membership settings. No user-count reset if a
genuine external signup occurs. Only aggregates and public metadata recorded.

No SQL/schema/RPC/RLS/grants, environment, auth protection, reward, aggregation
or capability change. No actual login/signup/person search/owner save/referral/
external invitation/notification-read action. Existing server page-view metrics
may increment on read-only page requests; not an assertion of zero all DB writes.

## Release/postflight

Feature commit `2f9e3d5d6b035c59c5abf0666b2f7b9786fba769`; PR
[110](https://github.com/quafactory-bit/schoollove/pull/110) Ready/squash merged.
Canonical Preview `a28843d14277daed752e74e7f6897c6f06ae038b`.
Feature `dpl_5tFE5AKf7Ub1yWQVuFvx67d5TzY4` READY; canonical Preview
`dpl_J765QBdYDwEcmhHbMmvXTuYczEoY` READY, alias `preview.schoollove.kr`.
Both exact source SHA checks passed and GitHub Vercel checks SUCCESS.

Production branch `codex/production-school-growth-ux-completion` from original
main, only the approved UX commit cherry-picked as
`71b35ecee453f426f793fa9a8b6428fe2fca167b`. PR
[111](https://github.com/quafactory-bit/schoollove/pull/111) checks SUCCESS,
Ready/squash merged to main `bd38e1c53d70a3ccc4b5a6a31c320fc3e99a22d5`.
Feature, canonical Preview, Production release and merged main ALL have exact
whole tree `91a1a385e512e43a01230664f928620b0e869dec` (runtime/assets/tests/docs).
No repeated full suite required for identical tree. Production deployment
postflight is recorded below after READY.

Actual live feature Home: current-input button and three-step guide present,
overflow0. Canonical Preview Home390/Hub1280: same correct UI, public projection
label and next goal, overflow0. Existing Preview authenticated account read:
My Schools, management summary and unchanged private DesktopNav all present.
No login or save performed. Preview deployment-scoped 5xx log query returned no
counts; read-only user/configuration aggregates exactly match preflight.

Local real React interaction matrix: 17/17 PASS including native-share success
and link-only copy reuse. Additional isolated checks: touch candidate selection,
deletion-pending write denial, long school name, semantic computed colors PASS.
Body/secondary/success/error/dark-action sampled contrast range 7.29–20.13:1.
The long-name supplemental fixture first retained its old mocked growth name;
correcting that mock (not runtime) produced the intended long-name rendering.
No blanket WCAG certification or all-browser testing claimed.

All 32 Before/After manifest rows include route/viewport/exact source commit and
local actual-React/network-mock labels. Share/viewport extra captures correspond
to feature commit2f9e3d5. Live Before Production Home is source5dbba050; live
After Preview Home/Hub are a28843d1. Private live personal values not saved in
screenshots or logs. Final report amendment is documentation only and will be
committed/pushed separately; it is not included in the above deployed tree.

### Production postflight — VERIFIED

- Deployment `dpl_9mHwHyYAy5xsh1uVVWgf3ahdf7gL`, READY, target production,
  exact SHA `bd38e1c53d70a3ccc4b5a6a31c320fc3e99a22d5`, aliases
  `www.schoollove.kr` and `schoollove.kr`, aliasError null.
- Anonymous GET Home /login /school/seoul-yangcheon-jinmyeongyeojagodeunghaggyo
  and `/api/schools/selection?slug=seoul-yangcheon-jinmyeongyeojagodeunghaggyo`
  all HTTP200. Guest Hub contains explicit school-join CTA; login Google button
  remains present (not clicked).
- Live Chromium Home390: form CTA and three-step guide, overflow0. Hub1280:
  public projection/next goal and existing member share CTA, overflow0. Login390:
  brand/Google CTA readable, overflow0. Production screenshots use main bd38e1c5.
- Existing Production authenticated session read at `/account`: My Schools,
  account-management summary, private desktop nav and overflow0 confirmed.
  No private values captured. Live new-user onboarding, actual save, school
  selection across real OAuth, native external share and real referral issuance
  remain NOT_EXECUTED; covered only to the stated local/mock extent.
- More than 60 seconds after READY, deployment-scoped first-window 5xx query
  returned no entries. This is a bounded postflight, not continuous monitoring
  or a guarantee that all future requests will succeed.
- All listed Preview/Production user and configuration aggregates unchanged.
  Production contributions3, awarded0, XP0, referrals0, referral visits0 and
  growth events0 remain equal. Migration47/pending0 retained. Existing page-view
  accounting may execute; user-data mutation/referral/auth mutation by agent0.

### Final status and remaining limits

SCHOOL_SEARCH_CTA_CONTINUITY_VERIFIED
SCHOOL_SELECTION_ONBOARDING_CONTINUITY_VERIFIED (actual React + mocked return/save)
GROWTH_COLD_START_EXPERIENCE_VERIFIED (engineering review, not user research)
GROWTH_VISUAL_HIERARCHY_VERIFIED
SHARE_PREVIEW_AND_COPY_VERIFIED (local mocked APIs)
PUBLIC_OWNER_PROJECTION_BOUNDARY_PRESERVED
SCHOOL_GROWTH_UX_PREVIEW_VERIFIED
SCHOOL_GROWTH_UX_PRODUCTION_RELEASE_VERIFIED

Changed files: 43 approved runtime/helper/test/harness/document files in PR110
and the identical PR111 source release; final amendment changes this report only.
Unchanged: every SQL migration, existing account write/auth/broker/referral/growth/
people search/request/accept/notification server implementation, env, lockfile,
root navigation mounting and A/B/C data. No packages installed. Current tests,
typecheck/build PASS, lint0 errors/84 legacy warnings, diff/secret scan PASS.
Risk/limits: physical Safari/device/browser-UI zoom and genuine-user conversion
unmeasured; existing probabilistic crypto test limitation documented above.
No new feature, monitoring, real-user wait, or further approval is needed to
close this UX scope. Final docs-only commit is pushed on the Production release
branch, not merged into main; runtime equality is unaffected.
