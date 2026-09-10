# SchoolLove Game Visual Experience V1 — 2026-09-10

## Release boundary

User authority: SCHOOLLOVE_GAME_VISUAL_EXPERIENCE_V1, supplied as the request.
Design: AFTER SCHOOL — OUR SCHOOL WORLD. Scope is source UI, assets, verification
and Preview release. Production main merge/deployment requires later visual approval.

| Starting baseline | SHA | Tree |
|---|---|---|
| Canonical Preview | a28843d14277daed752e74e7f6897c6f06ae038b | 91a1a385e512e43a01230664f928620b0e869dec |
| Production main | bd38e1c53d70a3ccc4b5a6a31c320fc3e99a22d5 | 91a1a385e512e43a01230664f928620b0e869dec |

Both remote refs were fetched and confirmed. The starting worktree was clean.
Feature branch: `codex/game-visual-experience-v1`, based on canonical Preview.
Preview and Production remote migration histories: 47 each, latest owner live
projection `20260909041329`. Migration files changed/created: 0. Explicit database
mutations: 0. Persisted environment/configuration mutations: 0. Build-only dummy
Supabase values prevent production credentials from being used for local reads.
Existing server Home-view accounting can occur during Preview GETs; this report
does not equate read-only browsing with a guaranteed zero change to all counters.

## Reference and implementation

The supplied collage is the primary reference: blue/pink/lavender sky, floating
campus, miniature depth, rounded cards, pink/violet CTA, growth meter, navy owner
dashboard and warm share preview. It is never embedded as runtime UI. All school
names, levels, progress, rankings, actions and explanations are DOM text.

Semantic tokens live in `app/game.css`, scoped to `.sl-game`. Sky `#bfd8ff`, navy
`#101d4f`, accessible primary pink `#bd246a`, violet `#6044d8`, soft pink `#ffdfed`,
soft blue `#eef2ff`, white surfaces, soft shadows and lavender glow. Pretendard
continues; no new font, animation library, engine, dependency or lockfile change.
Icons are existing Lucide primitives. No real-school crests are invented.

The imagegen workflow produced two accepted optimized alpha WebP assets, each
1000 × 667: `memory-seed.webp` 190572 bytes and `growing-campus.webp` 188926 bytes.
Combined 379498 bytes. Responsive Next Image derivatives, explicit dimensions,
hero priority and below-fold lazy loading preserve layout. Detailed prompts and
asset provenance: `public/images/game/README.md`. Rejected checkerboard artwork
was removed from the project; generated originals remain recoverable outside it.

`SchoolWorld` shares hero/compact/dashboard/share modes. The level is optional;
omitting it means decorative art with no level claim. No data fetching, storage,
permission checks or feature unlocking occurs inside the visual component.

| Level | Stage | Actual visual treatment |
|---|---|---|
| 1 | MEMORY_SEED | smaller quiet one-storey school; subdued color, no stars |
| 2–3 | FIRST_REUNION | same early campus, larger scale, warm aura and accents |
| 4–6 | GROWING_CAMPUS | larger two-storey campus, flag and richer vegetation |
| 7–9 | LIVELY_SCHOOL | rich campus with stronger warm/lavender aura |
| 10+ | BRIGHT_MEMORY | rich campus with golden stars and brighter glow |

Two building illustrations support five deterministic treatments. Five unique
buildings, independently animated trees/clouds/flags and illustrated alumni are
not claimed. This is an explicit asset limitation, not a hidden placeholder.
Ambient island float and star drift use slow CSS transforms. Reduced motion stops
them and progress transitions. Page entry never plays a level-up reward animation.

## Screens and behavior

| Surface | Result |
|---|---|
| Home desktop/mobile | school world and current-input search lead; compact real owner panel or honest guest panel |
| Guest/cold start | decorative campus; no fake school, level, member count, activity or ranking |
| Member Home | existing owner membership lookup and live owner growth; errors use guest guidance, never public fallback as owner data |
| Ranking | existing public aggregate only; empty and populated fixtures checked |
| Search | rounded result cards, generic school icon, region/type, keyboard autocomplete and input continuity retained |
| School Hub | campus world, actual public level/progress, next target and existing membership-gated actions |
| My School/Account | live navy growth dashboard first; private history/class editor retained; completed setup and management collapsible |
| Incomplete Account | next onboarding requirement and required forms remain available |
| Login | matching world illustration; sole Google entry and broker logic retained |
| Share | celebratory campus preview, no owner growth; explicit prepare, native share, text+link/link-only/manual copy retained |
| Connections | implementation untouched; shared bottom nav color and readable surface only |
| Mobile navigation | Home/search/connections/account all retained, 52px actual target minimum |
| Desktop navigation | real school search and Home anchors plus account; private desktop navigation retained |

Owner live and public delayed projection remain separate. No public exact member
count, name activity, private graduation/class data, private contribution or owner
XP is added. Share art receives no live growth. First qualifying membership +100
XP and qualifying referral +50 XP remain unchanged. Copy/share/login alone award
nothing. Referral opening creates nothing; explicit mocked preparation dedupes,
reuses and expires. People Discovery cap/access, Messaging OFF and connected
Instagram permissions are untouched. No new chat or Instagram integration.

## Evidence

Artifacts reside under `.local/game-visual/` (ignored), with functional regression
under `.local/growth-ux/functional.json`. These are actual React components with
synthetic local data and network mocks, not screenshot-only mockups.

BEFORE: live canonical Preview Home screenshots at 390 and 1440 pixels, HTTP 200,
zero browser errors and zero horizontal overflow. No private session was accessed.
AFTER: Home/guest/member/ranking/search/Hub Lv1/higher Hub/Account/Login/incomplete
Account/share across 360×800, 390×844, 412×915, 768×1024, 1280×900, 1440×900.
Six viewport matrix: 60 surface/state captures plus motion check; five additional
stage screenshots. Browser is desktop Chromium in responsive viewports, not
physical Android/iOS/Safari certification. Private screenshots contain explicitly
synthetic fixtures and do not certify a genuine live login or registration.

Reference comparison: `.local/game-visual/reference-left-home-right.png`; reference
on left, actual React desktop Home on right. 390 viewport crop and 200% CSS
enlargement captures are separate; CSS enlargement is not physical browser zoom.

| Check | Observed result |
|---|---|
| Targeted presentation, search, auth/account tests | 76 passed |
| Final account/stage follow-up | 34 passed |
| Full Vitest | 1697 passed, 4 existing skipped |
| Functional browser regression | 17 passed, all mutations intercepted locally |
| Responsive matrix | no horizontal overflow or broken images; reduced motion stopped |
| Share dialog | contained, keyboard trap, Escape focus return; zero issuance on open |
| TypeScript | passed |
| ESLint | 0 errors, 84 existing warnings |
| Build | passed, 67 static-generation entries; final source checked before release |
| Diff whitespace / changed-file secret scan | passed / zero findings |

Measured contrast pairs: navy/sky 11.049:1; secondary/soft blue 5.686:1; white/pink
5.794:1; white/violet gradient endpoint 7.123:1; stage label 6.931:1; owner text/lightest
navy 6.554:1; selected tab/white 6.203:1. These are measured palette pairs, not a
claim of exhaustive automated WCAG certification. Main action is at least 44px;
visible focus and 200% CSS enlargement tested. Artwork is aria-hidden with real
status text nearby; progress keeps aria-valuemin/max/now and projection labels.

Baseline Vercel build First Load JS: Home172, Account180, Login108, Hub111,
Search171 kB. Local new build: Home178, Account187, Login113, Hub117, Search178 kB.
Deltas: +6/+7/+5/+6/+7 kB. Shared JS remains101 kB. Responsive imagery adds network
image bytes, not a heavy 3D runtime. Hero art is the expected LCP candidate; live
performance observations are recorded during Preview postflight, not simulated
as field Core Web Vitals.

## Reference assessment

| Aspect | Assessment | Difference |
|---|---|---|
| Colors | MATCHED | darker CTA endpoint for contrast |
| School world | MATCHED | symbolic adult-friendly campus; no child characters |
| Depth | MATCHED | alpha art, foreground clouds, island, layered soft shadow |
| Cards | MATCHED | 22–30px curves, pastel panels and white surfaces |
| CTA | MATCHED | pink/violet gradient and clear action text |
| Mobile | MATCHED | school-world/search first; existing connection access retained |
| Dashboard | MATCHED | navy live growth card; factual owner values only |
| Share | PARTIAL | campus card and sharing flow; no alumni illustration or fake app integrations |

No measured increase in enjoyment, conversion or sharing is claimed. User visual
approval is still needed. The remaining art limitation is reuse across adjacent
stages and omission of stylized alumni. No placeholder or rejected asset ships.

## Release evidence

At this source checkpoint: LOCAL_VERIFIED. Feature commit, Draft PR, deployment,
Ready transition, Preview merge and canonical postflight will be recorded in the
operator postflight artifact `.local/game-visual/FINAL_REPORT.md` and final task
response. Never infer live verification from source or local screenshots alone.
Production main/deployment remains unchanged and requires later user approval.

Changed files are the scoped pages/components, `app/game.css`, two web assets,
test/harness and decision/design/log documentation. Existing API/auth/SQL/migration/
growth/referral/connection implementations, package files, secrets, admin screens
and prior release reports remain unchanged. Final working-tree and remote SHA
checks are recorded at handoff. No real signup, referral, school mutation, people
search, invitation, message or external share was executed. Full security E2E was
not repeated, as requested.
