# Home light shimmer verification

User requested more visible home lighting, water and flag sparkle. Changed `components/game/FantasyHero.tsx` and `app/fantasy.css`: eight warm light sources, seven water highlight paths, five clipped flag highlights and seventeen small glints share the original 1536×1024 artwork coordinate plane. Responsive cropping matches the prior composition. The original image file is unchanged.

Existing homepage copy, navigation, account features, APIs, database, permissions, packages and environment files are unchanged. Existing post-release V3 verification notes are preserved.

Verification completed before release:

- Targeted home/rendering tests: 43 passed.
- `npm run typecheck`: passed.
- Full `npm test -- --maxWorkers=2`: 1,708 passed, 4 existing skipped tests.
- Local browser motion check at 390 and 1280 widths: image/SVG alignment and 3:2 plane ratio, changing lamp opacity/water dash offset/flag position, pause/resume, offscreen pause, reduced motion and no horizontal overflow all passed. No browser errors.
- Evidence: `.local/growth-ux/home-light-review/results.json` and screenshots. Existing motion controls and cleanup behavior are reused; no new client effects or data requests.

`npm run build` passed with exit 0 and 67 static pages generated; existing lint warnings remain. Build used process-only loopback/dummy settings. `git diff --check` passed. Status: `LOCAL_VERIFIED` before release. Actual account writes, physical devices and older browser compatibility were not tested; no feature or database changes are part of this work. No additional user approval is needed for the requested visual update under the ongoing deployment authorization.

## Production release

- `PRODUCTION_VERIFIED`: PR #118 merged as `0b6a1c426e68536e3c6018a4435d8181053549aa`. Deployment `dpl_FNiZFCJnV1az6DjStmkct38XBgvS` is READY and assigned to `www.schoollove.kr` and `schoollove.kr`.
- `node .local/growth-ux/home-light-production-check.mjs` passed against the real production homepage at 390 and 1280 widths: image/overlay alignment, changing animation styles, pause/resume, offscreen pause, reduced motion, no horizontal overflow and no page errors. Client non-GET/HEAD requests were blocked by the test.
- Actual production screenshot inspected. Evidence: `.local/growth-ux/home-light-production/results.json`, `home-390.png`, `home-1280.png`. New deployment runtime error/fatal count query returned no rows during the release check.
- Remote actions: authorized commit, push, PR squash merge and automatic production deployment. No direct DB mutation, migration, environment or platform setting changes.
- Changed runtime files: `components/game/FantasyHero.tsx`, `app/fantasy.css`; accompanying decision, FROZEN addendum, changelog and verification records updated. Original image, existing copy and functional files preserved. Post-release evidence in this report and implementation log is retained locally after deployment.
- Remaining limits: physical-device/older-browser appearance and real account-write flows were not tested in this visual-only release. No further approval is needed to complete this request.
