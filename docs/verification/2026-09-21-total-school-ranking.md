# Total school ranking verification

Date: 2026-09-21 KST

Status: PRODUCTION_VERIFIED

## Scope

- Home `총 학교 순위` only; anonymous school notes are excluded.
- Ranking authority is published cumulative XP from privacy-batched school growth data.
- First through third use crowned podiums; fourth and fifth use smaller challenger rows.
- The existing caption-free siege video remains the ranking artwork.

## Local verification

- Targeted Vitest: 4 files, 30 tests passed.
- `npm run typecheck`: passed.
- Full Vitest: 209 files passed, 3 skipped; 1,722 tests passed, 4 skipped.
- `npm run build`: passed; all 67 static pages generated. Existing unrelated lint warnings remain.
- `git diff --check`: passed.
- Actual Next.js page with synthetic top-five data at 828px: heading 1, podium cards 3, challenger rows 2, crown groups 3, no horizontal overflow, no Next.js error overlay and no browser console errors.
- React review: server data fetch remains parallel, no new client state or persistence was added, list keys remain stable and ranking links have explicit accessible rank/name/XP labels.

## Data and privacy verification

- The new function reads only `private.school_growth_batches` rows whose `publish_at` has passed.
- The result contains school ID/name/slug, level/progress, published cumulative XP, rank and last published level-up time.
- It does not return user IDs, contributor keys, membership timestamps, graduation years, classes or Instagram data.
- Production read-only preflight before release: new function absent as expected; published batch count 0, ranked school count 0 and published XP 0. Therefore Production will show the honest empty state until privacy-batched XP is published.

## Production release

- Applied `cumulative_school_ranking` to Preview and verified stable `SECURITY DEFINER`, empty `search_path`, explicit anon/authenticated execution, revoked `PUBLIC` execution and an empty result with no published batches.
- Preview deployment `dpl_CV1ZnqkDTpJyVJPx4e1cCnhAy1A6` was READY. The real Preview Home showed `총 학교 순위` and the honest empty state, with no unavailable state, horizontal overflow, framework overlay or console errors.
- Applied Production migration version `20260921081259_cumulative_school_ranking`. The function returned an empty result because Production still had 0 published batches; its security and role boundaries matched Preview.
- PR #122 was squash-merged as `073c049317b7cc04dd5fe5d5b76b25d0c252680c`. Vercel Production deployment `dpl_BD1WF1cVcuQXekexXJDe28rrNAXW` reached READY and received the `www.schoollove.kr`, `schoollove.kr` and production Vercel aliases.
- The real Production Home showed the total-ranking frame and exact empty state rather than the unavailable state. The siege poster loaded, the video reached ready state 4 and played, and the page had no horizontal overflow, framework overlay or browser console errors.
- Production deployment error/fatal runtime log query for the release window returned no rows.
- Supabase security advisors report the new public `SECURITY DEFINER` RPC as callable by anon/authenticated. This is intentional for the bounded public ranking projection; direct `PUBLIC` execution remains revoked and the function exposes no contributor fields. Other advisor findings predate or are unrelated to this function.
