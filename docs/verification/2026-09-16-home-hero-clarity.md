# Home hero clarity verification

## Requested change

Make the background and characters clearer; keep the connection hint on one line and away from the characters. [Decision](../decisions/2026-09-16-home-hero-clarity.md).

## Changed / preserved

- `app/page.tsx`: “안부를 보내고, 서로 수락하면 연결돼요.” before the actions.
- `app/fantasy.css`: lighter text-focused gradient, one-line hint, 900px mobile hero to preserve an unobstructed character region.
- `components/game/FantasyHero.tsx`: quality90 and cover-plane-aware sizes (mobile1350px instead of viewport width).
- Decision, FROZEN addendum, CHANGELOG and implementation log document the requested refinement.
- Original raster, logo, headline, action destinations, light/water/flag animation and permission boundaries preserved. Existing SNS/Home documentation edits remain separate.

## Checks

- The existing local React fixture imports the actual components and CSS, uses synthetic service data and does not load environment files.
- Browser widths320/360/390/412/768/1280: no horizontal overflow, loaded image, exactly one hint line, no intersection between hint/action rectangles and the artwork's character region.
- Visually inspected mobile390 and desktop1280. Final mobile composition covers the full frame without the initial trial's exposed upper edge.
- Pause/resume still changes the hero state correctly; browser error log empty.
- `agent-browser` was unavailable; native CUA browser provided the same screenshot/DOM/error verification.
- Next `getImageProps` confirms the intended sizes and q=90 on every generated image candidate. The fixture shows the source image directly, so production optimizer response quality is not claimed as a browser-tested result.
- Targeted `npm test -- components/game/SchoolWorld.test.tsx`: 26 passed.
- `npm run typecheck`: passed.
- Two default-fork full-suite attempts produced no test result over several minutes and were interrupted; default-worker build attempts were also interrupted. These attempts are not counted as passes.
- `npm test -- --pool=threads --maxWorkers=2 --reporter=dot`: 208 files / 1,719 passed, existing 3 files / 4 tests skipped. Completed in 411.67 seconds; no tests excluded or weakened. The process completed successfully before the final stop request arrived.
- A temporary thread-worker build compiled successfully and completed lint/type checks but failed at static generation with `DataCloneError: ()=>null could not be cloned`. This attempt is not a build pass. The original config was restored byte-for-byte.
- Final `npm run build` passed (exit0, all67 static pages). It retained standard process-based page workers and changed only local compilation execution (`webpackBuildWorker:false`, `cpus:2`). Original `next.config.ts` bytes restored; `git diff -- next.config.ts` is empty. Build used process-only dummy service values and the existing remote-fetch deny module. Existing unrelated lint warnings remain.
- Final `git diff --check` passed. React review found no new hooks, client/server boundary changes or additional client-side state. Status: `LOCAL_VERIFIED`.

## Scope / limitations

The local implementation made no remote write, commit, push, merge, deployment, DB change, package change or environment-file edit. Existing production privacy work remains intact. The user subsequently explicitly approved commit, push, merge and production deployment with “응 응”; deployed optimized-image checks follow that release. Physical phone checks are not available. Higher resolution/quality can increase hero image transfer size. Local screenshots confirm clearer artwork but do not imply new detail beyond the original image.
