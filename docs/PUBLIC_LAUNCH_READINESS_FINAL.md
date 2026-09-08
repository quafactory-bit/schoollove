# Public launch readiness — execution record

Status: IN PROGRESS / NO GO DECISION YET. No remote mutation as of the initial
record. Deployment and launch fields below must be replaced with observed results,
not inferred from local tests.

## Authority and baseline

- main: a3a2ba2bfa622ca044fd5c94912f236f497aa00f
- Preview: e90a3a33dd4b57380ca9b6acba44c7265614e5f9
- common tree: 257689e6e747dd24ad0f5910304aa8f10dd54485
- migration history: 44 each; Production closed, Preview open.
- Production Auth/profile/membership 3/3/3; class children0; accepted requests2;
  active connections2; notifications8; messages0; handles/active Instagram grants0.
- People Discovery3, Connected Instagram2; active membership rows5.
- Preview Auth/profile/membership2/2/2; class children2; accepted request/connection1;
  notifications7; active membership rows4; messages0.
- Safe row fingerprints captured for profiles, memberships, requests, connections,
  notifications, beta members and invites before remote changes.

## Closed phases reused

Google-only authentication, C first-user onboarding, A→C exact-class positive
search/request/accept and class cleanup, directed Instagram/revocation cleanup,
class-history self-service, saved-history discovery, notification navigation.
Reuse is source- and baseline-bound; no fourth principal and no repeated search.

## Findings and candidate fixes

P0: public deletion did not prepare social revocation/cleanup, preventing Auth
hard delete under existing FK/check contracts. Reproduced against schema44;
candidate prepares official lifecycle first and completes the exact owned job.
Failure/retry, tombstones and connected-other-owner preservation pass locally.

P0: broker code consumption lacked a DB launch boundary. Candidate locks launch
state and rejects new unbound identities unless fully open, and all exchanges
under emergency. Existing bound return while closed is preserved.

P1: invite-first public onboarding; inaccurate policy/consent descriptions;
connection read failure falsely shown as empty; reply/chat labels when messaging
OFF; documented three-person cohort was not a DB-enforced operational ceiling.
Minimal UI/copy/error fixes and nullable audited operational-cap enforcement added.

P2: existing ESLint warnings (86); Google audience and canonical remote checks
still unverified here and remain required GO evidence, not cosmetic waivers.
P3: no unrelated redesign/refactor included.

## Local evidence

- Final full Vitest: 1,618 PASS / 4 existing skips, 201 files.
- Additional official cap action tests: targeted total21 PASS.
- TypeScript PASS; ESLint0 errors/86 existing warnings; production build63 routes PASS.
- Deployed schema44-only disposable restore → candidate45 applied once.
- Deletion/retry/related-owner, ten broker launch cases, capacity lifecycle and
  concurrent cap1 reservation (one winner/one PROGRAM_FULL) PASS.
- No-invite public onboarding with optional class children0 PASS; grants no
  people_search/connection_request/messaging/instagram_permission access.
- Official emergency stop blocks writes without deleting owner data PASS.
- Actual React fixture 360/390/412/1280: no horizontal overflow, adult setup before
  optional invite. 360 connection error/retry and real empty state separately shown.
- Remote data not used by fixtures. No real OAuth/message/Instagram action this phase.

## Release / final fields (pending)

Branch: codex/public-launch-readiness. Commit/tree/PR: pending.
Preview migration/merge/deployment/authenticated smoke: pending.
Production release PR/main/tree/migration/deployment: pending.
Final launch/cap: unchanged until all gates; candidate controlled decision EXPAND_5.
Google publishing/new-user readiness: prior C evidence reused, audience not yet verified.
Rate-limit/privacy/URL/logging/analytics: existing regression suite, final source review pending.
RLS/schema fingerprint postflight and final working tree: pending. Changed-file
credential pattern scan:36 files,0 findings (not a claim of exhaustive secret detection).
Migration45 LF SHA256:3a9f6e3047b3447dd84eaba9a2c134dc0d8b35379bd3ccca992497cf7deb0a8c.
Preview dry-run: exactly this migration, seeds0, roles0, no history mismatch.
Remote mutations, final counts and backout: to be recorded after execution.
Final classification: NOT YET DECIDED. Do not describe this file as a passed launch.
