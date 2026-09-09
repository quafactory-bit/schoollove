# School growth game — 72-field final release report

2026-09-09. PRODUCTION_VERIFIED for the approved release and read-only postflight. Positive award/referral/replay/concurrency writes were tested only in disposable databases, not with fake Production users or growth.

## Approved resume — Preview database PASS

- Migration `20260909013012` applied exactly once by Supabase CLI 2.117.0 with `--skip-vault`; exit 0. History 45→46, exact version count 1, final dry-run pending 0.
- SHA256 `0963e46d9293e3335ebe6beb66be8d9a9e7e62ec8924659b5a0e7e307bfca359` unchanged.
- Seven new private tables: RLS/FORCE RLS true; anon/authenticated direct SELECT/INSERT/UPDATE/DELETE denied. Eight new functions have empty search_path and explicit grants; public aggregate/owner RPC/service-only visit boundaries match the approved contract.
- Existing membership pairs 2, seen ledger rows 2, seen XP 0, state rows 1, state XP 0, level 1. Events/batches/referrals/visits/attributions all 0.
- Public ranking empty; target school returns public-only Lv1/progress0/weeklyXP0, no rank or level-up date.
- Existing Preview Auth2/2, profiles/memberships/classes2/2/2, accepted1, active connection1, notifications7, messages0, Instagram0/0/history2 unchanged; launch open and beta contracts unchanged.
- Advisor review: private no-policy INFO is intentional deny-all; exposed SECURITY DEFINER warnings match reviewed minimal public/owner RPCs. Existing extension-in-public and password-protection warnings were not modified. No new broad table grant or mutable search_path.
- Canonical Preview passed before Production was touched. Production subsequently passed the same migration/schema/XP0 gates; details below.

## Final 72-field report

1. Starting Preview SHA: 9871bd307f9855e3745e4e814203c83f4dc4a8d0; tree 1b9c6a7be4df2c5ab5ac5bb4a6ae2754021a2386.
2. Starting main SHA: 8b2d0fd0dff426fd758696b1e434688aa293fdd7; same tree.
3. Starting migrations: Preview45 / Production45; latest20260908050649.
4. Existing architecture: legacy snapshots, growth strips and ranking were audited, not blindly restored.
5. Old profiles dependency: legacy public profile-count authority remains isolated; new Home/Hub do not call it.
6. New authority: immutable principal/school seen ledger + atomic membership INSERT trigger.
7. Level curve: existing round(50*level^1.5), level1 threshold0, preserved.
8. XP sources: first school participation100, eligible same-school referral50; every other action0.
9. Base membership award: 100, once per principal/school.
10. Referral bonus: 50, once globally per new principal.
11. Existing memberships: seed seen rows with base0/referral0.
12. No-retroactive proof: disposable deployed schema45→46 with existing membership yields XP0/events0; delete/re-add remains0. Actual Preview2/Production3 existing membership pairs now have seen-only rows with total XP0.
13. Ledger: private.school_growth_contributions; unique school/contributor pseudonym and partial unique referred-principal index.
14. State: private.school_growth_states; cumulative XP/current level/timestamps; never decremented on membership deletion.
15. Events: private.school_growth_events plus delayed public school_growth_batches.
16. Referral schema: private.school_growth_referrals, school_growth_visits, school_growth_attributions; hashed random tokens/proofs.
17. RLS/grants: all seven private tables RLS+FORCE; no anon/auth table access; owner RPCs derive auth.uid(); visit RPC service-only.
18. Public RPC fields: schoolId, schoolName, slug, level, progress, weeklyXp, rank, lastLevelUp. Weekly XP is batch-only, not live.
19. Forbidden public fields: no principal/member IDs, names, email, Instagram, year/grade/class or inviter identity.
20. Calculation: private.school_growth_level matches TypeScript policy;100/200/300/500/1000XP→Lv1/2/3/4/7.
21. Level-up events: emitted only when the cumulative level crosses a threshold in the same transaction.
22. Weekly ranking: published batch XP in rolling7days; stable school ordering, max5; level never resets.
23. Today growth: real published level-ups dated today in KST, hidden when absent; no membership event stream.
24. Feed privacy: publish only cohorts of10 distinct new contributors at the next UTC day boundary; owner feedback is immediate.
25. Home order: hero/search → own schools → real today growth → weekly ranking → milestones → memory loop → privacy links.
26. Hero: “우리 학교는 지금 몇 레벨일까?” / “내 학교부터 찾아볼까요?”
27. Authenticated Home: owner-filtered membership school IDs; deduplicated public growth cards, no private school-history serialization.
28. Hub: school basic info → level/progress/rank → member share or account CTA → separately gated discovery → existing promotion boundary.
29. Share: member clicks → authenticated rate-limited token creation → native share/clipboard; cancellation does not copy.
30. Landing: school URL fragment removed immediately; same-origin POST establishes HttpOnly visit proof; no token in analytics/OG.
31. Conversion: explicit school choice, new Auth principal after visit, same-school current inviter, no self/replay; atomic award.
32. Self-referral: disposable deny PASS.
33. Duplicate reward: disposable replay and concurrent official saves PASS.
34. Delete/re-add: disposable existing/new user cases PASS, no second award.
35. Wrong-school: disposable base100/bonus0 PASS.
36. Expired referral: disposable base100/bonus0, new visit denied PASS.
37. A/B/C invariant: Production Auth3/3, profiles3, memberships3, classes0; no account writes/logins performed.
38. People Discovery: Production active3/cap5, people_search+connection_request only; unchanged.
39. Messaging: disabled, message rows0.
40. Instagram: existing controlled scope and two active members retained; handles0, active grants0, historical grants2.
41. Launch: open; registration/private profile/membership flags true, unchanged.
42. Mobile360: local, canonical Preview and Production Home/Hub no horizontal overflow; real browser width360, document354.
43. Mobile390: local, canonical Preview and Production Home/Hub no horizontal overflow; width390/document384; Production Hub screenshot inspected.
44. Mobile412: local, canonical Preview and Production Home/Hub no horizontal overflow; width412/document406.
45. Desktop1280: local, canonical Preview and Production Home/Hub no horizontal overflow; width1280/document1274. Actual Home screenshot inspected. Temporary viewport override reset.
46. Accessibility: semantic headings/ordered ranking, native share button, labeled progressbar/value, reduced-motion transition.
47. Targeted: growth unit10, API8, Home/Hub rendering13 PASS; disposable growth/referral/privacy/rollback/concurrency PASS.
48. Full Vitest: 1,649 PASS,4 existing skips;201 passed files/3 skipped.
49. TypeScript: PASS.
50. ESLint: 0 errors,86 pre-existing warnings.
51. Build: PASS,66 static pages generated; Korean OG1200x630 HTTP200 and visual PASS.
52. Diff check: PASS; no historical migration edits.
53. Secret scan: scoped pattern scan0 findings; no matching values printed (not a comprehensive secret-audit guarantee).
54. Branches: codex/school-growth-game-loop-v1; Production release codex/production-school-growth-game-loop-v1.
55. Runtime commit: 4bf6a6f527a307b1b5d98abb7b002aacd861ab81; tree a9045ce17192c00ffe9625cfcd4dfc24ffe4277f. Subsequent checkpoint edits are docs-only.
56. PR106: approved head cff4742705dd6087549dca2ec37a5e75e6de5e86 (runtime + docs-only checkpoint), Ready then squash MERGED to preview; Vercel check SUCCESS.
57. Preview migration: exactly once,45→46,version20260909013012 count1, final dry-run pending0; no seed/roles/vault updates.
58. Canonical Preview SHA: 2ad27b332bfe10f6b0adfb0fc6cef34626dac421; tree6f43bdd621eda4f9e1b775283360f127b02b0b90.
59. Canonical Preview deployment: dpl_8RkSSzokofopGhBNAW6bVZKdyfEF READY, exact SHA, alias preview.schoollove.kr. Initial feature dpl_CzqcP5J61kn5QhCjmDbHcb7amPau retained as earlier evidence.
60. Preview smoke: Home HTTP200, real cold-start copy, Hub Lv1/progress0; existing-session own school/share UI visible without clicking share. No fake ranking, new login or person search. New deployment5xx count0 in observed window.
61. Production PR107: base main, head af5a916c80315aef8b72de51061c492538a4fb46; exact same tree as canonical Preview, Vercel check SUCCESS, squash MERGED.
62. Production migration: exactly once,45→46,version20260909013012 count1, final dry-run pending0. Applied raw LF SHA256 equals approved0963e46d9293e3335ebe6beb66be8d9a9e7e62ec8924659b5a0e7e307bfca359. Git checkout CRLF was normalized back to the exact committed LF bytes before apply; no SQL-content change.
63. Production main: f4adbc26d9f2af57a1cecc01353b370eca9631b3; tree6f43bdd621eda4f9e1b775283360f127b02b0b90, identical to Preview.
64. Production deployment: dpl_9QaRmEEUCjSrxyk2j2W7qX6wFCNe READY, exact main SHA; aliases www.schoollove.kr and schoollove.kr. Previous READY remains dpl_ErxTTkPgJvdC6BobXcxDyuHnKbxS; no rollback executed.
65. Production Home: HTTP200, new hero and honest empty ranking, existing-session own-school section observed; real desktop/mobile checks PASS. New deployment5xx/error/fatal logs0 in early postflight (not a future-uptime guarantee).
66. Production Hub: HTTP200, Lv1/progress0, existing-session share and separately gated discovery CTA visible; share not clicked. OG HTTP200 image/png. Search/login200, Google CTA retained without OAuth; anonymous account growth401 and /account307. Console errors0 on checked pages.
67. Final DB counts: Preview Auth2/2,profiles2/memberships2/classes2/accepted1/connection1/notifications7/messages0; Production Auth3/3,profiles3/memberships3/classes0/accepted2/connection2/notifications8/messages0. Both migrations46. Pre/post aggregate/config comparison identical except migration count.
68. Growth states: Preview1/Production1, each XP0/Lv1; seen rows2/3. Events/batches/referrals/visits/attributions0 in both after all UI checks.
69. Backfilled XP=0: actual Preview and Production postflight confirmed, no synthetic remote award. Existing A/B/C memberships were not deleted or recreated.
70. Working tree: runtime release clean and exact-tree verified; final results are a separate docs-only commit on the Production release branch. No runtime follow-up edit or extra Production deployment requested.
71. P2: audited expired-reference purge policy (expiry currently denies use, not physical purge); small-cohort growth publication latency; populated remote ranking cannot be fabricated. No additional feature rollout authorized by level.
72. Product judgement: SCHOOL_GROWTH_GAME_PREVIEW_VERIFIED and SCHOOL_GROWTH_GAME_PRODUCTION_RELEASE_VERIFIED. Implementation/release loop verified with disposable positive-write proof and real remote read-only postflight. Actual new-user/referral conversions and populated remote ranking were deliberately not fabricated; organic-use observation remains operational follow-up.

## Historical safety-review stop and explicit resume

Earlier migration/document commands were rejected before execution. The user
then explicitly approved the exact Preview migration and conditional Production
release in chat; this report records that resumed, completed execution.
Private row-fingerprint queries were also rejected; only non-identifying counts
and operating configuration were collected. No claim of row-byte equality.
Owned disposable containers and schema-only dump were deleted; fixtures can be
regenerated from checked-in scripts. No remote user, relation or forensic cleanup.

## Verification commands and remaining limits

- `npm test -- lib/schoolGrowthGame.test.ts app/api/growth/growthRoutes.test.ts components/growth/growthRendering.test.tsx --maxWorkers=4`:31PASS.
- `npm run typecheck`; `npm test -- --maxWorkers=4`; `npm run lint`; `npm run build`; `git diff --check origin/main HEAD`:PASS on the release tree. Vitest1649PASS/4existing skips; lint0errors/86existing warnings; build66static pages.
- Pinned Supabase CLI2.117.0 `db push --project-ref <approved-ref> --dry-run --skip-vault` before/after and one non-dry-run apply per environment. No repair/reset, role/seed/vault update or migration retry.
- Read-only catalog checks: 7private tables, RLS/FORCE,12required indexes, explicit function ACLs/empty search_path, active trigger; existing class-history RLS/FORCE retained.
- New private no-policy advisor INFO is deny-all by design. Public aggregate and owner-bound SECURITY DEFINER warnings are intentional reviewed RPC surfaces. Existing extension-in-public/password warnings were not fixed by unrelated changes. [Advisor reference](https://supabase.com/docs/guides/database/database-linter) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- No additional OAuth, real user creation, membership save, referral creation/share, messaging, Instagram mutation or populated public ranking test on Production. No row-level private fingerprint export. Counts/configuration, not private row-byte equality, were verified.
- Runtime/source release changed44files from prior main; final follow-up changes only this report, SCHOOL_GROWTH_GAME_V1.md and IMPLEMENTATION_LOG.md. Auth/provider/env configuration, historical migration files and existing A/B/C data were not edited.
- No further approval needed for this completed release. Retention purge implementation, new operational/user tests or feature scope expansion require separate work/authority.
