# Game Visual Polish V1 — feature review candidate, PARTIAL

2026-09-10. Branch `codex/game-visual-polish-v1`; canonical PR112 baseline
`85686b49d222109c9d8f947679733b32cde504fe`. This is **not five-form completion**
or canonical/Production verification. Ready and canonical merge remain gated.

## Implemented / pending

| Area | Result |
|---|---|
| Character direction | MATCHED: original cute boy/girl duo, not three adults; fixed decoration independent of personal data |
| Campus forms | PARTIAL: seed → benches/circle → larger campus → garden/gazebo; fifth arch is missing |
| Alpha | Shipped assets pass real-alpha checks; rejected opaque checkerboards are excluded |
| Motion | Pause/resume, keyboard, reduced-motion initial/change, offscreen verified locally; hidden-document event is synthetic |
| Responsive | 61 actual-React checks across 360/390/412/768/1280/1440 passed |
| Performance | Final same-protocol AVIF candidate measured; complete run table below |
| Public/owner/share | Existing projection and symbolic share boundaries preserved; no business-rule edits |
| Release | Feature Draft only; no Ready, Preview merge or Production release |

Home keeps the existing composition. New decorative duo, distinct reunion and
lively forms, mode-specific image sizes, actual 1000×667 metadata, a lightweight
client motion wrapper and two approved microcopy changes are the runtime scope.
The Home critical campus has a typed AVIF picture source with responsive WebP
fallback and one typed preload. Other stages remain responsive WebP; compact
cards have no character or motion button. Five stages are not preloaded.

## Same-condition mobile lab

Actual Next15.3.8 production builds and compiled guest Home; synthetic local RPC
returns open/empty-growth with fixed100ms delay. No real account or remote DB.
Chrome153.0.8010.36, 390×844, DPR3, CDP CPU4×, network150ms latency,
200000 bytes/s download (1.6Mbps), 93750 bytes/s upload (0.75Mbps).
Five fresh browser contexts with cache cleared, then three warm reloads in one
separately primed context. Optimizer/browser primes are recorded but excluded.
Observation lasts at least10s and through load/hero visibility if longer, using
the same algorithm for all versions. No routing that disables browser cache;
remote HTTPS blocked. No concurrent browser checks during counted final runs.

| Candidate/cache | Every counted run (ms) | Min / median / max |
|---|---|---|
| Before / fresh | 2592, 2972, 2628, 2640, 2828 | 2592 / 2640 / 2972 |
| Before / warm | 448, 488, 460 | 448 / 460 / 488 |
| First WebP After / fresh | 2668, 2708, 2684, 2676, 2624 | 2624 / 2676 / 2708 |
| First WebP After / warm | 536, 504, 448 | 448 / 504 / 536 |
| Final AVIF After / fresh | 1644, 1672, 1668, 1668, 1604 | 1604 / 1668 / 1672 |
| Final AVIF After / warm | 1112, 564, 628 | 564 / 628 / 1112 |

Fresh CLS0.00808317; warm CLS0 for all three candidates. The first After missed
the 2.5s budget and regressed36ms; all runs are retained. One explicit subsequent
AVIF candidate was tested without relaxing conditions or removing the duo.
Final fresh median improved972ms (36.8%). This is lab evidence, **not field CWV**.
Warm median regressed168ms (36.5%) and first warm run was1112ms. This is not a
blanket no-regression pass: static AVIF revalidation/decoding remains an explicit
follow-up risk and release-review gate, despite both medians being below2.5s.

The actual final LCP element is `.sl-world-image`, not inferred from JSX width.
Before cold1: TTFB271.9ms, load delay51ms, load duration2151.7ms, render117.4ms.
Final cold1: TTFB268.6ms, load delay47.7ms, load duration809.4ms, render518.3ms.
The image transfer bottleneck improved; AVIF decode/render remains visible and
is not claimed free. Before selected Next WebP1200/q75 encoded135724B; final
AVIF62666B. The concurrent font is2057688B and JS also competes for bandwidth.
The old3.98s lacks adequate raw protocol/trace metadata and is not comparable;
we do not assert that image size alone caused it.

## Executed verification

- Targeted Vitest:35 passed; standalone `npm run typecheck` passed.
- Final full `npm test`:206 files passed,3 skipped;1704 tests passed,4 skipped.
- `npm run lint`:0 errors,84 existing warnings. No test was skipped to gain a pass.
- `node scripts/game-visual-polish/lab-server.mjs build`: successful final
  production build,67 generated pages; dummy process-only local transport,
  no remote fetches, no changes to environment files or platform configuration.
- `node scripts/game-visual/verify.mjs .local/game-visual-polish/after-final`:
  61 checks passed, no horizontal overflow; six viewports, actual React fixtures.
- `node scripts/growth-ux/check.mjs .local/game-visual-polish/functional-final`:
  17 mocked functional regressions passed. Mock membership/referral/clipboard/
  native-share operations are not live E2E or external messages.
- `node scripts/game-visual-polish/edges.mjs`: long names, two school cards,
  360px and720px reflow-equivalent viewport, decorative-image failure passed.
  720px is not a physical browser200% zoom test.
- `node scripts/game-visual-polish/motion.mjs`: keyboard pause/resume,44px hit
  target, control outside aria-hidden, actual offscreen observer, OS media changes
  and initial reduced-motion passed;10s actual React browser video retained.
  Document-hidden uses a synthetic getter/event, not physical tab switching.
- `node scripts/game-visual-polish/art-evidence.mjs`: real alpha and
  white/pastel/navy composites; same500px stationary/effects-off stage sheets
  explicitly label missing fifth form. These do not pass the five-form gate.
- `node scripts/game-visual-polish/measure.mjs before`, `after`, `after-avif`:
  all raw runs, screenshots, traces, cache/resource/subpart data retained.

Failures retained in the record: initial generated assets failed alpha; reference
editing returned a sandbox-helper decode error before the approved continuation;
fifth-stage retries still failed alpha. Edge harness initially failed twice
because its growth response returned the first school ID for both cards; corrected
only local fixtures, then passed. Video encoder initially hit spawnEPERM; the same
command passed formal sandbox approval. PR-list network access initially failed;
the identical read command passed formal approval. No alternate-tool bypass.
The privacy test sentinel1000 was changed to987654 because1000 is now legitimate
image width; the whole-HTML non-disclosure assertion remains intact.

## Evidence index (local, ignored)

Root `.local/game-visual-polish/` on the user's workstation:

- `before/home-390.png`, `before/home-1440.png`: unchanged compiled baseline.
- `after-production/home-390.png`, `after-production/home-1440.png`: final compiled
  candidate (same synthetic guest content/DPR1 for screenshot comparison).
- `after-final/`:61 actual React responsive checks and screenshots.
- `stages-static.png`, `stages-effects-off.png`: five IDs/four forms, fifth PARTIAL.
- `alpha-check.png`, `asset-manifest.json`, `avif-alpha-navy.png`.
- `avif-alpha-three-backgrounds.png`, `avif-manifest.json`, `evidence-index.json`;
  compiled Home and share Before/After comparison sheets.
- `motion/results.json`, `motion/pause-390.png`, actual `.webm` video.
- `edges/results.json`, `functional-final/functional.json`.
- `perf-before/`, `perf-after/`, `perf-after-avif/`: complete raw result sets;
  final runtime file hashes recorded before the candidate runs. Later provenance
  documentation is not executable runtime or asset data.
- `full-tests-final.log`, `lint.log`, `build-final.log`.

The older `.local/game-visual-polish/STATUS.md` is a historical blocked checkpoint,
not the current result; it has not been erased. No cookie/token/review query is
included in the new evidence or repository report.

## Change boundaries and release gates

Changed runtime: `app/game.css`, `app/page.tsx`, `app/login/page.tsx`,
`components/game/SchoolWorld.tsx`, new `GameMotionControl.tsx`,
`components/growth/GrowthHowItWorks.tsx`, `GrowthShareButton.tsx`, four new assets.
Also changed targeted tests, local-only QA scripts, asset provenance, decision,
implementation log and ignore rule. No unrelated working changes were present.

Unchanged: original two schoolWebPs; API/server policy/auth/XP/referral logic;
all DB/migrations/RPC/RLS; package/lockfiles; environment and protection settings.
No explicit remote user-data write, new login/signup/school-save/person-search/
referral issuance/external share; A/B/C and existing relationships not exercised
or modified. GET pages may retain pre-existing aggregate page-view behavior;
this is not a claim that every database field everywhere stayed constant.

NOT_TESTED: physical Safari/iOS/Android, real provider login, private live writes,
actual tab backgrounding, physical200% browser zoom, full new gradient-position
contrast audit, field CWV. Prior contrast numbers are not a new audit.

Remaining release blockers: warm-cache regression review, valid real-alpha BRIGHT_MEMORY arch scene and final
five-form visual review, feature live read-only postflight and any unpassed
accessibility gate. Feature source/deployment/PR facts are appended after remote
operations; do not infer a deployment from local tests.

Canonical stays https://preview.schoollove.kr at PR112. Production remains outside
scope: main baseline `bd38e1c53d70a3ccc4b5a6a31c320fc3e99a22d5`.
**Production is not updated; separate user design/release approval is required.**
