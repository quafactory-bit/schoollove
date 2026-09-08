# Public launch readiness — execution record

Status: PUBLIC ACCOUNT OPEN / PEOPLE DISCOVERY CAP5 / INITIAL POSTFLIGHT VERIFIED.
Production opened at 2026-09-08T07:13:52.7621Z (16:13:52 KST) after explicit
cap5/open/document-push authorization. Registration, private profile and school
membership flags are true. The later 30–60-minute observation is SCHEDULED,
not yet passed. Public account opening does not grant People Discovery access.

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

P2: existing ESLint warnings (86); Google audience remains External/Testing.
The actual Google scope is only `openid profile`, which Google's official audience
documentation exempts from Testing allowlist and seven-day authorization limits.
Publishing status was inspected read-only; it was not changed.
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

## Observed release

- Original branch/commit: codex/public-launch-readiness / 1ff6c99938e636605c8a0ff1e5bf05eb72e7a5bf, pushed.
- PR104 Preview merge: 9871bd307f9855e3745e4e814203c83f4dc4a8d0.
- Canonical Preview: dpl_6Ydd3MXx1rsHsa4q4mymJ4TdFrbk READY, exact merge SHA, preview.schoollove.kr alias.
- Production candidate: codex/production-public-launch-readiness / 0eb5c264ceef0fe69949db1683cd6e312ed0463d.
- PR105 main merge: 8b2d0fd0dff426fd758696b1e434688aa293fdd7.
- Production: dpl_ErxTTkPgJvdC6BobXcxDyuHnKbxS READY, exact main SHA, www.schoollove.kr alias.
- All four source trees: 1b9c6a7be4df2c5ab5ac5bb4a6ae2754021a2386.
- Both databases: 44 to 45, exact migration applied once per project with --skip-vault; post-dry-run pending0.
- Migration LF SHA256: 3a9f6e3047b3447dd84eaba9a2c134dc0d8b35379bd3ccca992497cf7deb0a8c.
- Schema: tables82 unchanged, columns856 to857, functions210 to213. RLS/policies and each environment's legacy exact/same-class function hashes unchanged. New private helper EXECUTE denied to anon/authenticated/service_role; public administrative RPCs service-only, SECURITY DEFINER, empty search_path.
- Production candidate independently repeated full Vitest1618 PASS/4 skips, typecheck, lint0 errors/86 warnings, build63 routes and diff check. Earlier targeted/disposable/browser evidence is tied to the exact same tree.
- Scoped credential-pattern scan36 files/0 findings, not exhaustive secret detection.

## Remote smoke and preserved boundaries

Preview existing B session: new Account UI and connections normal, neutral `연결 확인`, real empty notification state. No OAuth, profile edit, search or notification click.
Production operator session: /admin/operations and /admin/beta/setup accessible; emergency controls and new operational-cap UI visible. Production user session expired, so fresh authenticated end-user smoke is DEFERRED, not claimed passed. Reused today's completed C first-onboarding evidence plus changed-boundary disposable tests; no fourth principal.
Production /, /login, /privacy, /terms HTTP200; /account, /onboarding, /connections anonymous307 to login. Discovery/JWKS200, issuer https://www.schoollove.kr, kid production-rs256-v1; GET /oauth/token405. No live OAuth initiated. Actual login viewport360/390/412/1280 no horizontal overflow; 390 screenshot inspected.
Custom OIDC remains enabled, openid-only, client slb-supabase-google, PKCE true, nonce check true, email optional true. Recovery deliveries sent3, cleanup jobs0, incidents0, live OAuth attempts0; today's expired1/consumed4 are pre-existing. Runtime logs for the new Preview/Production deployments returned no matching5xx/error/fatal entries in the checked30-minute window; this is not a load-test or all-day guarantee.
Security advisors:44 INFO/28 WARN, no new-object finding; existing service-only deny-all tables and deliberate owner RPC boundaries reviewed rather than weakened.

Production final: Auth3/3, profiles3, memberships3, classes0, accepted requests2, connections2, notifications8, messages0, handles0, active Instagram grants0, historical grants2, match tokens1/live0, consumed claims3. People Discovery active3; Connected Instagram active2. Actual capability counts search3/request3/messaging0/Instagram2. Seven owned-row fingerprints unchanged in both environments.

## Explicitly authorized resume and public open

The earlier cap action and documentation commit were rejected by automatic action
review and were not bypassed. The user then explicitly authorized Production
People Discovery cap5, conditional public-account open, and a new commit/push of
these three result documents to codex/production-public-launch-readiness.

Before resuming, main SHA, migration45, ready/flags-false state, current readiness,
incidents/cleanup/live OAuth0, and all seven owned-row fingerprints were rechecked.
Readiness48edff2e-853b-4172-bc4b-1d69b4baba4c, recorded06:54:52.035761Z,
was still the latest valid record, under20 minutes old, blocker0, and matched the
exact deployed SHA and migration digest. It was revalidated, not blindly reused.

- Official admin_set_beta_operational_cap returned true; readback cap5, occupancy3
  for people_discovery_jinmyeong_20260902. Immutable snapshot ceiling20 and period
  remain unchanged. No invite/member/user was created by this operation.
- Official admin_open_public_account_launch returned true. Audit records
  ready → open at07:13:52.7621Z, with all three owner-account flags true.
- Initial post-open readback: Auth3/3, profiles/memberships3/3, classes0,
  accepted requests2, active connections2, notifications8, messages0; all seven
  owned-row fingerprints remain exact. Incidents0, cleanup jobs0.
- Actual effective beta feature-user counts remain search3/request3/messaging0/
  Instagram2. No public discovery entitlement, new invite, OAuth or search action.
- Actual browser home shows `성인 계정 시작` and Google-only private-account copy.
  Anonymous HTTP: home/login200, account/connections307 to login, discovery/JWKS200.
  Google CTA is present; no login was initiated. Temporary verification tab closed.
- Post-open grouped Production logs returned no5xx in the checked30-minute window.
  This does not prove future stability or a completed30–60-minute observation.
- Heartbeat schoollove-1 is scheduled about40 minutes after its creation for a
  single read-only follow-up, then pause. Target window16:43:52–17:13:52 KST;
  delayed or blocked execution must be reported, never called a completed PASS.

Final classification: GO — PUBLIC_ACCOUNT_OPEN_INITIAL_VERIFIED /
PEOPLE_DISCOVERY_EXPAND_5_APPLIED / POST_OPEN_OBSERVATION_PENDING.
Production runtime main remains8b2d0fd0dff426fd758696b1e434688aa293fdd7.
This result-document commit does not authorize a new main merge or Production
deployment. No runtime/source, migration, env/provider/credential or Preview
change occurred during this resume. The two authorized Production operational
RPCs and their audit writes are the only remote application-state changes.
No backout was needed. Fresh Production end-user smoke remains deferred as above.

Sources: [Google audience Testing exceptions](https://support.google.com/cloud/answer/15549945?hl=en), [PR104](https://github.com/quafactory-bit/schoollove/pull/104), [PR105](https://github.com/quafactory-bit/schoollove/pull/105).
