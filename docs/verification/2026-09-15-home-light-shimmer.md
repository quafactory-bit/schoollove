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
