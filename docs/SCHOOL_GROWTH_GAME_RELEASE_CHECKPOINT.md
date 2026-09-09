# School growth game — 72-field checkpoint

2026-09-09. Preview migration gates passed after explicit chat approval. Production release is still pending; the older checkpoint below is retained as execution history.

## Approved resume — Preview database PASS

- Migration `20260909013012` applied exactly once by Supabase CLI 2.117.0 with `--skip-vault`; exit 0. History 45→46, exact version count 1, final dry-run pending 0.
- SHA256 `0963e46d9293e3335ebe6beb66be8d9a9e7e62ec8924659b5a0e7e307bfca359` unchanged.
- Seven new private tables: RLS/FORCE RLS true; anon/authenticated direct SELECT/INSERT/UPDATE/DELETE denied. Eight new functions have empty search_path and explicit grants; public aggregate/owner RPC/service-only visit boundaries match the approved contract.
- Existing membership pairs 2, seen ledger rows 2, seen XP 0, state rows 1, state XP 0, level 1. Events/batches/referrals/visits/attributions all 0.
- Public ranking empty; target school returns public-only Lv1/progress0/weeklyXP0, no rank or level-up date.
- Existing Preview Auth2/2, profiles/memberships/classes2/2/2, accepted1, active connection1, notifications7, messages0, Instagram0/0/history2 unchanged; launch open and beta contracts unchanged.
- Advisor review: private no-policy INFO is intentional deny-all; exposed SECURITY DEFINER warnings match reviewed minimal public/owner RPCs. Existing extension-in-public and password-protection warnings were not modified. No new broad table grant or mutable search_path.
- Production remains migration45 and unchanged until canonical Preview verification passes.

## Earlier checkpoint (before explicit resume approval)

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
12. No-retroactive proof: deployed schema45 with seeded existing membership →46 yields XP0/events0; delete/re-add remains0.
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
42. Mobile360: local Home/Hub no horizontal overflow; Home screenshot inspected.
43. Mobile390: local Home/Hub no horizontal overflow; Home screenshot inspected.
44. Mobile412: local Home/Hub no horizontal overflow; Hub screenshot inspected.
45. Desktop1280: local Home/Hub no horizontal overflow; Home and deployed feature layout inspected.
46. Accessibility: semantic headings/ordered ranking, native share button, labeled progressbar/value, reduced-motion transition.
47. Targeted: growth unit10, API8, Home/Hub rendering13 PASS; disposable growth/referral/privacy/rollback/concurrency PASS.
48. Full Vitest: 1,649 PASS,4 existing skips;201 passed files/3 skipped.
49. TypeScript: PASS.
50. ESLint: 0 errors,86 pre-existing warnings.
51. Build: PASS,66 static pages generated; Korean OG1200x630 HTTP200 and visual PASS.
52. Diff check: PASS; no historical migration edits.
53. Secret scan: scoped pattern scan0 findings; no matching values printed (not a comprehensive secret-audit guarantee).
54. Branch: codex/school-growth-game-loop-v1.
55. Runtime commit: 4bf6a6f527a307b1b5d98abb7b002aacd861ab81; tree a9045ce17192c00ffe9625cfcd4dfc24ffe4277f. Subsequent checkpoint edits are docs-only.
56. PR: #106, Draft, base preview; Vercel feature check PASS for runtime commit.
57. Preview migration: NOT APPLIED. Dry-run exactly1; apply rejected before execution by automatic safety review.
58. Canonical Preview SHA: unchanged9871bd307f9855e3745e4e814203c83f4dc4a8d0; no merge.
59. Feature deployment: dpl_CzqcP5J61kn5QhCjmDbHcb7amPau, READY, runtime SHA exact; not canonical Preview promotion.
60. Preview smoke: feature Home visually verified in-app; growth unavailable fail-soft because schema46 absent. Canonical positive game smoke deferred.
61. Production PR: not created, awaiting Preview gates.
62. Production migration: unchanged45, new growth schema absent.
63. Production main: unchanged8b2d0fd0dff426fd758696b1e434688aa293fdd7.
64. Production deployment: no new deployment; prior baseline remains dpl_ErxTTkPgJvdC6BobXcxDyuHnKbxS.
65. Production new Home: not deployed / not claimed.
66. Production new Hub: not deployed / not claimed.
67. Final DB counts: Preview2 profiles/2 memberships/2 classes/1 accepted/1 connection/7 notifications/0 messages; Production3/3/0/2/2/8/0. Both migrations45.
68. Growth states created remotely:0 (table absent); local synthetic state tests passed.
69. Backfilled XP: remote apply0; disposable existing-member proof XP0. Production post-migration proof pending.
70. Working tree: runtime commit pushed; two checkpoint documents remain local (one modified, one new). The docs-only commit/push was also rejected before execution by automatic review. No source changes remain uncommitted.
71. P2: audited expired-reference purge policy (expiry currently denies use, not physical purge); small-cohort growth publication latency; populated remote ranking cannot be fabricated. No additional feature rollout authorized by level.
72. Product judgement: local implementation and feature Preview verified, release BLOCKED on explicit migration approval. SCHOOL_GROWTH_GAME_LOOP_V1_COMPLETE is NOT declared.

## Safety-review stop

The rejected migration command did not execute. Do not retry or use a different
transport until the exact Preview project/migration approval is supplied in chat.
The follow-up documentation commit/push/PR-body update was separately rejected
before execution. Those two local documents are preserved, not discarded.
Private row-fingerprint queries were also rejected; only non-identifying counts
and operating configuration were collected. No claim of row-byte equality.
Owned disposable containers and schema-only dump were deleted; fixtures can be
regenerated from checked-in scripts. No remote user, relation or forensic cleanup.
