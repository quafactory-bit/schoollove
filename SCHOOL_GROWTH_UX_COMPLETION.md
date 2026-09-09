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

LOCAL_VERIFIED; feature/canonical Preview and Production evidence pending.
No remote source mutation before this checkpoint. Final report will record PRs,
SHA/tree/deployment aliases, exact-source equality, public live results, baseline
comparison, remaining docs-only commits and clean worktree state.
