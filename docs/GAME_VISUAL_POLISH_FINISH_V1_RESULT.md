# Game Visual Polish Finish V1 — local result, PARTIAL

2026-09-10. Continue `codex/game-visual-polish-v1` from
`307ba3679d5912e6e02f28fd7ee91b437dc0f188` without a new branch/redesign.
This document is the pre-push source record. The ignored local
`.local/game-visual-polish/finish/FINAL_REPORT.md` records final commit/deployment
metadata and live postflight after push. No review URL or cookie is recorded.

## Gate status

| Gate | Evidence / disposition |
|---|---|
| Cute duo | CUTE_DUO_DIRECTION_PRESERVED; original fixed boy/girl asset unchanged |
| Five forms | ASSET_REQUIRED; four distinct forms, fifth still reuses lively |
| Final alpha | FAIL: both bounded candidates are RGB opaque checkerboards; excluded |
| Performance comparison | COMPLETE: one current Before 5+3 and one After 5+3, all raw runs retained |
| Warm no-regression | WARM_CACHE_REVIEW_REQUIRED; improved current median, still above historical PR112 |
| Local UI/function/motion | Verified with actual React and synthetic network; limitations below |
| GitHub PR | GITHUB_PR_PERMISSION_REQUIRED; original connection's restoration unconfirmed |
| Feature live | Pending final SHA deployment at this document's commit; READY is not browser verification |
| Ready/merge/canonical | Withheld: fifth form, warm review and PR permission remain unresolved |
| Production | Not authorized; no Production PR, main merge, deploy or alias change |

## Runtime and unchanged scope

Only runtime change in this continuation: `SchoolWorld.tsx` statically imports
the **same** 62,666-byte AVIF. Next emits
`/_next/static/media/growing-campus-v2.be0d51a2.avif` with
`public, max-age=31536000, immutable`. The compiled response is byte-identical
to the accepted asset (SHA256
`1cd565ab00086da302f7e1a63c1d4e84127eec21647b7c89d9d3a9fe0f1bf5f4`).
Typed preload and picture source share that URL; responsive WebP fallback stays.
No image recompression, global cache rule, CDN/Next config or package change.

All `public/images/game` assets, CSS, four forms, cute duo, motion implementation,
app/API/lib/DB/migration/RPC/RLS/auth/XP/referral calculations and permissions,
environment/protection settings, dependencies and lockfile are unchanged from
307ba36. No A/B/C, relationship, notification or school-history manipulation.
No actual login/signup, school save, people search, referral issue or external
share. Public GETs can cause existing view metrics; no claim that every remote
DB field stayed unchanged is made.

Changed support files: SchoolWorld tests; evidence scripts under
`scripts/game-visual-polish`; this result, decision and implementation log.

## Final form and alpha evidence

One precise arch edit of `lively-school-v1.webp` and one background-only
correction were attempted with the built-in image tool. Both are 1536x1024,
three-channel RGB, `hasAlpha=false`, not RGBA. Initial output: 2,447,767 bytes,
SHA256 `34b54c11cdbd78841c04edfa9065af94fed1eae44e0b1781b653c238cd469d3e`.
Correction: 2,857,181 bytes, SHA256
`8593378d2067c9f7c391568ec39cb25aefb44d4c21ae165137da7047c6ddb0a9`.
White/pastel/navy composites still show the baked checkerboard. Neither is in
runtime/public. No manual alpha-removal, alternate API or unlimited retry.

Existing four school WebPs and duo pass alpha metadata/transparent-pixel checks
and visual review on white/pastel/navy. The 500px-canvas stationary and grayscale
effects-off sheets show Lv.7 and Lv.10 identically, explicitly labelled PARTIAL.
Small comparison and mobile stage captures are retained. An acceptable fifth
form input is still required; test counts do not replace it.

## Same-condition mobile lab: every counted run

Next 15.3.8 production builds; Chrome 153.0.8010.36; 390x844 DPR3; CPU4x;
150ms latency; download200000/upload93750 bytes/s. Synthetic guest, local-only
RPC fixed100ms. Optimizer primed; five fresh contexts/cache clears and three
reloads of one separately primed warm context. Minimum10s, through load/visible
hero if longer. No concurrent browser tests in counted runs. All historical
results remain untouched; no good-run selection or additional batches.

| Version/cache | Counted LCP runs, ms | Min / median / max |
|---|---|---|
| PR112 fresh | 2592, 2972, 2628, 2640, 2828 | 2592 / 2640 / 2972 |
| PR112 warm | 448, 488, 460 | 448 / 460 / 488 |
| Historical first WebP fresh | 2668, 2708, 2684, 2676, 2624 | 2624 / 2676 / 2708 |
| Historical first WebP warm | 536, 504, 448 | 448 / 504 / 536 |
| Historical 307ba36 AVIF fresh | 1644, 1672, 1668, 1668, 1604 | 1604 / 1668 / 1672 |
| Historical 307ba36 AVIF warm | 1112, 564, 628 | 564 / 628 / 1112 |
| Current unchanged 307ba36 fresh | 1712, 1612, 1476, 1660, 1440 | 1440 / 1612 / 1712 |
| Current unchanged 307ba36 warm | 676, 576, 564 | 564 / 576 / 676 |
| Finish immutable AVIF fresh | 1648, 1388, 1180, 1468, 1552 | 1180 / 1468 / 1648 |
| Finish immutable AVIF warm | 456, 552, 556 | 456 / 552 / 556 |

Current Before primes2572/1340ms and After primes2428/1736ms are recorded,
excluded from counted comparisons. Before build `45S4wrsheQjlIdrQNjxf-`;
After build `5uwUkelcg5EiETbagYz28`. After was measured on the uncommitted
candidate above 307ba36; runtime hash manifest, not git HEAD alone, identifies
the measured source. The final package asserts matching runtime/asset hashes.

Current Before fresh CLS all0.00808317, warm all0. After fresh CLS
0.00808317/0.00808317/0.00808317/0.00808317/0.02615049; warm0/0/0.00973277.
All stay within CLS0.1, but the higher individual shifts are retained, not
reported as zero. Cold median satisfies2.5s and preserves the prior improvement.
Current median delta: cold -144ms, warm -24ms. Compared with historical PR112:
cold -1172ms, warm +92ms. Warm no-regression is **not** waived for merge.

### Bottleneck findings and limits

- Selected LCP remains `.sl-world-image`, the AVIF campus, for every counted run.
- Current Before warm uses304, `max-age=0`, transferSize300B; image load
  duration179.3/182.5/190.0ms. Old 1112ms warm outlier did not reproduce in the
  current baseline, but revalidation did.
- After warm uses cached200, transferSize0B and resource load duration0ms for
  all three. CDP `fromDiskCache=false`; do not mislabel it as a disk-cache hit.
  Immutable headers plus zero transfer show cache reuse without revalidation.
- Exactly three image resources: hero AVIF, decorative duo WebP384 and compact
  card campus WebP256. No large hero WebP fallback duplicate and no other-stage
  preloads were observed. The compact WebP is a different rendered consumer.
- After warm TTFB269.0/263.5/248.7ms; render delay158.0/255.7/247.9ms.
  Revalidation removal does not remove remaining rendering/scheduling work.
  Largest selected warm layout events21.9/48.0/61.0ms; script evaluation and
  style/layout events are included in the trace analysis. No explicit ImageDecode
  events in these trace categories: render delay is **not** measured decode time.
- Motion wrapper/observer and hydration source remain unchanged in the paired
  test. No causal proof assigns the residual delay to them or AVIF decoding.
  Existing 2,057,688-byte font and JS competition remain evidence for later
  investigation, not authorization for a new font/global-optimization project.
- Historical3.98s has a different/insufficient recorded protocol. No claim that
  image bytes alone caused it, nor that these local lab values prove field CWV,
  actual-device performance, engagement or conversion.

Raw directories: `.local/game-visual-polish/perf-{before,after,after-avif,finish-before,finish-after}`.
Each has counted/primes JSON, trace JSON, screenshot, full results and manifest.
`finish/performance-analysis.json` retains per-run resource/cache/LCP subparts
and selected long main-thread events.

## Local verification and caveats

- Targeted41 tests passed; `npm run typecheck` passed.
- `npm test`: 206 passed files /3 skipped; 1705 passed tests /4 existing skipped.
- `npm run lint`:0 errors,84 existing warnings. Build succeeded,67 generated pages.
  Build command: `node scripts/game-visual-polish/lab-server.mjs build` (actual
  Next production build with all data transport synthetic/local).
- `finish-runtime-check.mjs`: compiled immutable header and byte identity passed.
- `game-visual/verify.mjs`:61 actual React responsive checks passed across
  360/390/412/768/1280/1440. `growth-ux/check.mjs`:17 mock functional checks passed.
- Long-name/two-card reflow and actual decorative-image failure passed. The
  first failure test incorrectly blocked Vite's JS asset-import module; narrowed
  to image requests, retaining explicit broken-image assertions. A subsequent
  locator ambiguity was corrected to assert all campus images. Failed evidence
  folders retained; final `finish/edges-final/results.json` contains the pass.
- Pause/resume keyboard/focus44px, reduced-motion initial/change, real offscreen
  checks passed. First video encoder launch was denied EPERM; the exact normal
  command was granted formal execution permission and succeeded in
  `finish/motion-approved`. No encoder fallback. Document-hidden remains a
  synthetic event/getter, not real OS tab-backgrounding.
- Home390/1440 recaptured from production builds. Share390 and Hub390/1280
  compare retained307ba36 real-React screenshots with final real-React fixture.
  All are browser viewports, not physical mobile devices. 720px reflow is a
  200%-equivalent check, not physical browser zoom. No gradient/color changes,
  so no new contrast measurement is claimed.
- Assets/motion/accessibility/scripts follow the imagegen, web-performance,
  browser-verification and Vercel deployment skills within the user's fixed
  scope. Chrome DevTools dedicated connector was unavailable (DevToolsActivePort);
  the user's existing Playwright/CDP protocol was retained, without installing tools.

## GitHub connection blocker and normal next action

Prior `mcp__codex_apps__github_create_pull_request` failed403
`Resource not accessible by integration` for repository
`quafactory-bit/schoollove`, base`preview`, head`codex/game-visual-polish-v1`.
The GitHub connector can read; current duplicate query returns0, installation
listing and installed-account listing return empty arrays. These responses do
not establish the globally installed App identity, exact token type, scope or
organization policy. Required-permission response header was not exposed.
The current browser's GitHub installation-settings URL redirects to login;
no login or security-setting change was performed.

The user/account owner should inspect the **existing Codex-connected GitHub
integration**, not create a PAT or switch tools: verify the same repository is
included and approve any already-requested `Pull requests: write` update. If
the managed App does not request that scope, its publisher/connection support
must expose it; the user cannot invent a new checkbox. The installed App's exact
name could not be verified from the current logged-out browser. No all-repository
or administrator permission is requested. Do not send tokens in chat.

After confirmed restoration: query duplicate PRs, use existing PR or make the
authorized Preview-base Draft once via the original connector. Another403 stops
that remote operation. Git push permission is not PR API permission. No retry
or alternate PR route was used while restoration remained unconfirmed.

Sources: [GitHub Create a pull request](https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request),
[GitHub REST troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api).

## Remote plan and stop condition

Only same-branch commit/push and feature Preview are authorized here. One
official23-hour deployment review link is newly authorized for the final exact
feature SHA; target/scope must be checked first, and URL/cookie never persisted.
No project protection changes, shared bypass secret or old PR112 link reuse.
Authorization denial stops that step. Guest Home/public Hub/login entry are
the only live targets; private account/share remain synthetic fixtures.

At pre-push review canonical preview still matches
`85686b49d222109c9d8f947679733b32cde504fe`; main still matches
`bd38e1c53d70a3ccc4b5a6a31c320fc3e99a22d5` by connector compare.
No Ready/preview merge while ASSET_REQUIRED, WARM_CACHE_REVIEW_REQUIRED or
GITHUB_PR_PERMISSION_REQUIRED remains. No Production action in any case.
