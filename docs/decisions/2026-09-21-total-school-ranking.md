# Total school ranking

Status: APPROVED BY USER / implementation and production application requested on 2026-09-21.

The Home ranking changes from recent-seven-day XP to the published cumulative XP total. It is titled `총 학교 순위`, shows exactly the real top five when available, and keeps the existing caption/logo-free siege video. First, second and third use prominent gold, silver and bronze crowned podium cards; fourth and fifth use smaller encouraging cards. Every row shows its published cumulative XP.

This change uses only privacy-batched `school_growth_batches` whose `publish_at` has passed. It does not expose the live ledger, contributor count, user identity, membership timestamp or unpublished XP. Ranking is deterministic by published cumulative XP descending and school UUID for equal totals. A new `get_total_school_ranking` public function returns `totalXp`; the existing seven-day function remains available for release compatibility but is no longer used by the current Home and school pages. The existing level curve, non-decreasing level behavior, award rules (+100 first membership, +50 valid referral), batching threshold and publication delay are unchanged.

This scope does not implement the anonymous school-note feature, note XP, global note feed, moderation, storage or new contribution sources. Those remain a separately reviewed proposal.
