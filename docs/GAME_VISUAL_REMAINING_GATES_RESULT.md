# Remaining gates after c538e02

2026-09-10. Same branch: `codex/game-visual-polish-v1`.
Baseline: `c538e02e59471a9fef7344f2eeab5247e868f7bb`.
The user's direct approval, not the proposal attachment alone, authorizes the
independent SVG/DOM structure. No rejected raster was processed.

## 1. 완료한 로컬 작업 / completed local work

### Fifth scene, independent structure

`SchoolMemoryGate.tsx` adds original vector geometry over the unchanged accepted
`lively-school-v1.webp` only for BRIGHT_MEMORY. Cream masonry, bevels, blue slate
coping, a genuinely open arch, receding shallow steps, low garden walls and small
planted bases distinguish it from the previous garden/gazebo scene. It is not
just a glow/color/scale change and is not derived from either rejected image.

The base remains at its original size and placement. The gate shares its1000x667
coordinate plane, sits on the left garden terrace and does not overlap the cute
boy/girl duo on the right. The original four raster files and duo are byte-for-byte
unchanged. Invalid-input/level thresholds and symbolic Home/share semantics are
unchanged. This is **five rendered forms using four raster sources plus one
independent SVG**, not five new raster files.

One wrapper moves the campus and structure together, with no independent SVG
animation, new observers, timers, API calls or event listeners. Existing keyboard
pause/resume, reduced-motion initial/change and offscreen behavior apply to that
wrapper. Compact ranking scenes stay static and have no nested control/duo.
The SVG is `aria-hidden`, non-focusable and pointer-inert. Stable React `useId`
gradient IDs avoid collisions when multiple final-stage scenes render together.

### Visual, alpha and actual React evidence

Evidence root: ignored `.local/game-visual-polish/remaining/`.

| Artifact / check | Result |
|---|---|
| `stages-static.png` | Equal500px canvases, levels1/2/4/7/10 |
| `stages-effects-off.png` | Motion/glow/stars/contact shadow off, grayscale, equal scale; level10 arch remains distinct |
| `three-backgrounds.png` | Actual scene on white/pastel/navy; no checker rectangle or opaque arch opening |
| `gate-alpha.png` | Browser rasterization of the new SVG only; RGBA, transparent corners and opening; transparent fraction0.9581874 |
| `hub-{width}.png`, `owner-{width}.png` | Final-stage actual React at360/390/412/768/1280/1440; no horizontal overflow or gate/duo overlap |
| `compiled-hub-390.png`, `compiled-home-390.png` | Actual local Next production build, synthetic transport, not feature deployment |
| `checks.json` |15 check records:12 viewport cases, alpha, motion and unchanged raster hashes |

Visual inspection confirms structural distinction and transparent composition.
The SVG remains visibly a vector interpretation of the campus materials; final
stylistic acceptance belongs to the user's design review, not a unit-test count.
No imagegen call, alpha repair, background-removal CLI or alternate image API was
used. The prior failed candidates remain excluded and untouched.

### Validation actually run

| Command | Actual result |
|---|---|
| `npx vitest run components/game/SchoolWorld.test.tsx components/growth/ownerGrowthRendering.test.tsx components/SchoolGrowthPanel.test.ts components/RegistrationGrowthRewardCard.test.ts components/ShareButton.test.ts` |5 files,45 PASS |
| `npm run typecheck` |PASS |
| `npm test` |206 files PASS /3 existing skipped;1710 PASS /4 existing skipped |
| `npm run lint` |0 errors /84 existing warnings |
| `node scripts/game-visual-polish/lab-server.mjs build` |Actual Next15.3.8 production build PASS,67 generated pages, local-only transport |
| `node scripts/game-visual-polish/remaining-gates.mjs` |All15 final records passed; five-form/effects-off/background evidence generated |
| `node scripts/game-visual/verify.mjs .local/game-visual-polish/remaining/responsive` |61 actual React responsive checks PASS |
| `node scripts/growth-ux/check.mjs .local/game-visual-polish/remaining/functional` |17 synthetic functional checks PASS |
| `node scripts/game-visual-polish/remaining-lab.mjs` + `remaining-runtime.mjs` |Compiled Home/level10 Hub SSR, hydration, image loading, pause/resume PASS;0 page errors |

Production build ID: `OkggSlELgdKJYRXi2FPUb`. The local synthetic runtime serves
only fixed school metadata and a fixed level10 projection; no actual database,
user login, school save, people search, referral issue or external share occurs.
The first new Vite capture hit a reload/navigation race before evidence was
complete; waiting for fixture network idle resolved it. No runtime workaround
or relaxed assertion. Fontconfig cache and Vite public-import path warnings are
not claimed to be absent. Real physical devices, real background-tab switching,
new performance batch and remote browser postflight were not executed.

Next.js/React skills informed SSR checks, stable IDs and animation of the shared
DOM wrapper rather than SVG. Browser skills informed actual-render checks; the
agent-browser CLI is absent, so the existing local Playwright fixture was used.
No tool or network permission bypass was used.

### Files changed and files preserved

Runtime: `components/game/SchoolMemoryGate.tsx` (new),
`components/game/SchoolWorld.tsx`, six scoped rules/comments in `app/game.css`.
Tests: `components/game/SchoolWorld.test.tsx`.
Local validation: `scripts/game-visual-polish/remaining-{gates,lab,runtime,manifest}.mjs`.
Documentation: this result, the existing decision and implementation log.

Unchanged: all existing public artwork, cute duo, AVIF bytes/immutable URL,
`GameMotionControl.tsx`, page structure, app/API/lib/business logic, DB/migrations/
RPC/RLS/growth/XP/referral/auth/access rules, environment/protection settings,
packages/lockfile and existing A/B/C/relationship data. No new branch/redesign.
Old reports and raw performance results retain their historical status.

## 2. 사용자의 판단이 필요한 항목 / user decisions

1. **Final design acceptance:** review the independent gate at mobile and desktop
   sizes, including grayscale/effects-off comparison. Local form/alpha verification
   is complete; aesthetic approval is not inferred.
2. **Warm difference remains unaccepted:** the c538e02 candidate's measured552ms
   warm median remains92ms above the historical PR112460ms. Do not label it
   no-regression PASS. The same current paired comparison was576→552ms; historical
   and current samples are not claimed statistically equivalent.
3. **New payload trade-off:** rendered gate SVG is4489 bytes (standalone gzip1579;
   serialization IDs can change exact size). It adds no external image resource.
   The compiled Home has no gate DOM and keeps the identical62,666-byte immutable
   AVIF, but the shared client bundle includes the component. An unthrottled
   resource-size observation found decoded script bytes657595→662757 (+5162).
   Next's rounded First Load JS is180→182kB. These are size observations, not a
   new timing comparison. This cost joins the final design/performance review.

The user explicitly stopped iterative optimization to erase92ms. No new cold/warm
LCP batch, recompression or font/global optimization was run. Preserve the proven
asset/cache mechanism without claiming the new commit has exactly the old timing.

Historical raw LCP table (ms, unchanged; not re-executed this turn):

| Version / cache | All counted runs | min / median / max |
|---|---|---|
| PR112 cold |2592,2972,2628,2640,2828|2592 /2640 /2972|
| PR112 warm |448,488,460|448 /460 /488|
|307ba36 current Before cold|1712,1612,1476,1660,1440|1440 /1612 /1712|
|307ba36 current Before warm|676,576,564|564 /576 /676|
|c538e02 candidate cold|1648,1388,1180,1468,1552|1180 /1468 /1648|
|c538e02 candidate warm|456,552,556|456 /552 /556|

Full preceding protocol, all intermediate candidates, CLS and trace limitations
remain in `GAME_VISUAL_POLISH_FINISH_V1_RESULT.md` and `.local` raw directories.
No renewed attribution of the old3.98s to image size; no field CWV/engagement claim.

## 3. 외부 권한 복구를 기다리는 항목 / external permissions

### GitHub connection

Existing **GitHub connector** Draft creation for `quafactory-bit/schoollove`,
head`codex/game-visual-polish-v1`, base`preview` previously returned403
`Resource not accessible by integration`. Normal restoration has not been
confirmed. Empty installation metadata did not identify the installed App or
prove a particular policy denial. This turn: PR creation retry0, alternate
credential/tool route0. Git push approval/ability is not PR API scope.

Account owner/connection provider must restore repository access and the existing
integration's requested `Pull requests: write` through normal settings. No token
submission requested. After confirmed restoration only: duplicate query, then
existing Draft or one authorized Draft creation. No Ready while other gates remain.

### Browser network access

Prior target: `schoollove-q1ycv3a5w-quafactory-s-projects.vercel.app`,
deployment`dpl_EyvfbZ7tWkjY9pZ4Ztc6za3pQJrA`, source c538e02. The prior official
review-link creation succeeded, but browser navigation failed with
`net::ERR_NETWORK_ACCESS_DENIED`, before any HTTP response. This does not prove
which firewall/app/domain policy caused the denial and is distinct from Vercel
share authorization. This turn: no navigation retry, link reissue, protection
change, cookie extraction, proxy, alternate network route or HTML-fetch substitute.

Normal browser environment network access must be restored before actual latest
feature verification. The old deployment/link is not proof for a later SHA.
No live Home/Hub/login/private-session verification is claimed for this work.

### Remote boundary and stop

Only approved same-branch commit/push will carry this local candidate; final SHA
and clean status are recorded in `.local/game-visual-polish/remaining/manifest.json`
after push and in the user-facing handoff. Git integration may automatically build
a feature Preview, but this is not live verification. No PR creation, Ready,
preview merge, canonical alias update, Production PR/main merge/deploy or DB/user
mutation is performed. Canonical remains the prior PR112 release, not this candidate.

Status: **FIVE_RENDERED_FORMS_LOCAL_VERIFIED**, **LAYER_TRANSPARENCY_LOCAL_VERIFIED**,
**CUTE_DUO_PRESERVED**; **DESIGN_REVIEW_PENDING**, **WARM_DIFFERENCE_DECISION_PENDING**,
**GITHUB_PR_PERMISSION_REQUIRED**, **BROWSER_NETWORK_ACCESS_REQUIRED**.

## Subsequent user acceptance and web preflight — 2026-09-10

The preceding sections are historical, not the current design decision. The user
has accepted942a305's gate/duo/five rendered forms and the known warm+92ms and
decoded-JS+5162B costs. DESIGN_ACCEPTED / PERFORMANCE_TRADEOFF_ACCEPTED does not
mean NO_REGRESSION_PASS or a new942a305 measurement. Original raw data is retained.

Following explicit approval of the owner's normal GitHub web workflow, the user
completed GitHub authentication. Owner UI created Draft PR113 into preview after
zero duplicate matches; existing connector installation metadata remains empty,
and API write recovery is not claimed. No credential extraction/protection bypass.

The actual942a305 feature Home rendered normally in the in-app browser at360/390/
1440px: duo preserved, no broken images or horizontal overflow, mouse pause and
keyboard resume working. Existing public Jinmyeong Girls High School slug rendered
at actual Lv.1, with no data changes to manufacture Lv.10. Login entry was closed
(`로그인 준비 중`); no SchoolLove OAuth/search/save/referral/share was executed.
The captured Home/School/login error+warning console observations were empty.

PC School Hub exposed a genuine16.29px motion-button/caption overlap at1440px.
Only a desktop caption24px top margin is added under the approved local-regression
clause. Final corrected-head deployment verification remains required before
Ready/merge. Evidence is under ignored `.local/game-visual-polish/web-final/`;
final postflight will be recorded on PR113 and in a local report, not fabricated
in this pre-push record. Historical five-stage/alpha/private fixtures remain
separate from live public observations. OS reduced-motion emulation is not exposed
by this browser tool; its unchanged implementation retains the previous local
initial/change evidence, not a new live OS-settings test.
