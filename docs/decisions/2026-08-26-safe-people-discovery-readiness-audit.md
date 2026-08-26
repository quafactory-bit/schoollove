# PHASE 10U — Safe people-discovery readiness audit

Date: 2026-08-26
Status: Audit complete; people discovery remains disabled

## Decision

현재 dormant인 사람 찾기·연결 경계는 인증, exact match, opaque token, receiver-only 응답, participant authorization과 service-role/RLS 경계의 중요한 기반을 갖췄지만 public Preview에 열 준비가 되지 않았다. PHASE 10U는 runtime, API, migration, feature flag 또는 외부 설정을 바꾸지 않는다. `people_search`, `connection_request`, `messaging`, `instagram_permission`은 계속 비활성 상태로 유지하며 아래 P0/P1을 별도 PHASE 10V에서 먼저 해결하고 다시 검증해야 한다.

## Fixture parity and authority

- 시작 권위는 Preview commit `c44da52609ceff442b1d57a5cc54707441d71cd1`, Production main `3b0bd3898e85285944f6b6d3da64776570e43ab9`다.
- disposable image는 `public.ecr.aws/supabase/postgres:17.6.1.143`, image ID `sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453`다.
- local과 Preview 모두 PostgreSQL `17.6` (`170006`), `standard_conforming_strings=on`, collation/ctype `en_US.UTF-8`다.
- line-ending-normalized `connection_text_is_safe(text,integer)` MD5는 Preview와 local 모두 `cd7e6244b9484be310c85ec28d54a378`다. 두 한글 greeting과 URL/domain/email/phone/@handle/external-ID clause의 독립 compile/execute probe가 통과했다.
- 최초 local 실패는 Windows PowerShell 5의 native stdin encoding이 `Get-Content ... | docker exec -i ... psql` 구간에서 migration의 비ASCII regex를 `?`로 변환한 SQL transport drift였다. audit harness가 SQL 파일을 `docker cp`하고 container 내부에서 `psql -f`로 읽도록 바이트 보존 전송만 고쳤다. runtime 함수, 기존 migration과 safety filter는 변경하거나 약화하지 않았다.
- 분류: `PHASE_10U_SQL_TRANSPORT_ESCAPE_DRIFT_RESOLVED`.

## Current dormant architecture

| Surface/action | Auth | Feature authority | Rate limit | DB/RPC authority | Browser data / side effect | Public reachability |
| --- | --- | --- | --- | --- | --- | --- |
| `/people/search` page | server session | `people_search` | — | none | shell only | no authority면 `/account` redirect |
| search POST | verified session | `people_search` | 20/day, IP + account | service-only exact-match RPC | state; only available match gets opaque token; token-row write | disabled for ordinary account |
| requests GET / create POST | verified session | response: `people_search+connection_request`; create: same | 20/10m response, 5/day request | service-only list/create RPC | masked request data / request+notification write | disabled for ordinary account |
| request respond/cancel/remind | verified session | respond/cancel: `people_search+connection_request`; remind: same | response 20/10m; reminder 3/day | receiver/sender-bound RPC | request/connection state mutation | disabled with features |
| connections GET | verified session | none | none | participant-filtered service read | connection ID, full connected name, status/time | existing connections remain readable |
| conversation GET/POST/PATCH | verified session | `messaging` | 30/min | participant-only RPC/read | messages / send/read mutation | messaging disabled |
| disconnect/block | verified session | deliberately none | response 20/10m | participant-only safety RPC | disconnect/block mutation | retained safety action |
| report | verified session | deliberately none | 5/day | participant-only safety RPC | block+disconnect+report | retained safety action |
| Instagram POST/DELETE | verified session | `instagram_permission` | 10/10m | directional participant RPC | permission mutation | disabled |
| Instagram GET | verified session | **none** | none | participant read + active permission | counterpart handle may be returned | P0 gate gap |

Pages and routes are private/noindex where applicable. Requests and conversation page shells require only authentication, but their data APIs enforce the action gates except the documented connections-list and Instagram-GET cases. No browser input chooses `actor_user_id`; all mutation actors come from the verified session.

## Exact-match and data-minimization conclusion

- Input is strict school UUID + graduation year + NFKC/trimmed exact name of at least two characters. One-character, chosung-only, whitespace-only, unknown fields, partial/fuzzy/`ILIKE` search and lists are rejected or absent.
- RPC authority is active `private_profiles` plus `profile_school_memberships` only. Legacy `profiles`, anonymous registrations, nickname and Instagram are not search inputs.
- Zero or multiple matches and self-search return no token. A never-registered target and a one-person-school miss remain generic non-match; no shadow profile, invite identity or membership count is created.
- Search returns no target/profile/Auth UUID, result list or count. The opaque UUID token is SHA-256-hashed at rest, bound to requester, receiver and target membership, expires after ten minutes, is row-locked/single-use, rejects another requester and replay, and has exactly one winner under concurrent consumption.
- Target membership deletion and target profile deletion invalidate the token through FK cascade. Requester membership deletion after issuance is not rechecked and currently still allows request creation.
- Pre-accept fields are request ID, masked sender name, relationship, immutable greeting, status/time/reminder and the receiver's own matched school/year. No sender email, Google identity, user/Auth/profile UUID, Instagram or other school history is exposed. After acceptance, connection ID, full counterpart display name and participant-scoped conversation fields are available.
- Coarse events contain only fixed event key/count; searched name, school/year, target, token, greeting and participant identifiers are not event payloads. Rate-limit keys use domain-separated SHA-256 IP/account hashes rather than raw values.

## Findings

### P0_BLOCKER (2)

1. **PUBLIC_EMERGENCY_DISCOVERY_BYPASS** — with disposable public state `emergency_stopped`, an otherwise active beta user still received a match token and created a request. Page/API/search/request RPC authority has no public launch/emergency precheck.
2. **INSTAGRAM_GET_FEATURE_GATE_BYPASS** — `GET /api/connections/[id]/instagram` requires authentication and participation but not `instagram_permission`; a previously granted counterpart handle can remain readable while the feature is disabled.

### P1_REQUIRED_BEFORE_PUBLIC (8)

1. **CROSS_SCHOOL_EXACT_SEARCH_ALLOWED** — an actor owning only school A membership can search school B exactly and receive a token. PHASE 10V must require actor ownership of the target school. Actor and target graduation years need not match because approved relationships include same-school and senior/junior.
2. **RELATIONSHIP_STATE_EXISTENCE_ORACLE** — `not_found`, `request_unavailable`, `already_requested`, `already_connected` and `match_available` have distinguishable bodies/copy and byte sizes. Block/prior-relationship state can disclose more than a binary intentional exact-match decision even though all representative success states use HTTP 200 and the route pads to at least 250 ms.
3. **REQUESTER_MEMBERSHIP_NOT_RECHECKED** — deleting the requester's membership after token issuance does not prevent request creation.
4. **DELETION_PENDING_DISCOVERY_AND_REQUEST_ALLOWED** — deletion-pending actors can search and create requests, and deletion-pending targets can be found.
5. **ACCEPTANCE_ELIGIBILITY_NOT_RECHECKED** — a receiver can accept after the sender becomes suspended; `respond_connection_request` does not recheck current adult/deletion/safety eligibility for both parties.
6. **PRACTICAL_GREETING_OBFUSCATION** — the current URL/email/phone/handle/provider filter rejects ordinary and zero-width/full-width forms, but accepts spaced phone digits, `example dot kr`, parenthesized handles and spaced provider words. Natural self-identification such as `나 완이야` remains allowed; only external contact exchange needs strengthening.
7. **SEARCH_RATE_TOO_HIGH_FOR_FIRST_RELEASE** — 20 exact existence checks/day per IP and account is broader than the first narrow public release needs. Start at 5/day and revisit with aggregate-only evidence.
8. **PENDING_SAFETY_RESPONSE_COUPLED_TO_DISCOVERY_FLAGS** — decline, wrong-person, request-level block and report share the `people_search+connection_request` dependency. PHASE 10V must preserve receiver safety/closure actions after a feature stop while preventing new search/request writes.

### P2_HARDENING (3)

1. Document and validate the trusted-proxy contract for the first `x-forwarded-for` value; otherwise all missing addresses collapse to the `unknown` bucket.
2. Minimum-duration padding reduces an obvious timing class but is deterministic and does not equalize response sizes. After the P1 state contraction, consider bounded jitter and uniform response encoding without treating it as a standalone privacy control.
3. Auth-only connection/request/conversation shells and the ungated existing-connections list do not create new relationships, but PHASE 10V should explicitly define which existing-relationship reads survive a feature pause to prevent future alternate-path drift.

### ACCEPTABLE_AS_IS (16)

1. Authentication and ordinary-account beta denial.
2. Exact-only schema and no list/count/profile card.
3. Ambiguity and self-search non-disclosure.
4. Private-profile/membership-only authority and legacy non-use.
5. Opaque, hashed, short-lived and bound token design.
6. Expiry, wrong-requester, replay and single-winner concurrency rejection.
7. Target membership/profile deletion token invalidation.
8. Receiver-only acceptance and sender-only cancellation/reminder object authority.
9. Participant-scoped request/connection/message/block/report/Instagram IDOR denial.
10. RLS enabled + FORCE RLS, no anon/authenticated writes and service-only mutation RPCs.
11. Masked sender identity and receiver-owned school/year before acceptance.
12. One immutable 200-character greeting and no pre-accept messaging.
13. Decline/wrong-person terminality; block/report prevent rediscovery, with report adding safety record.
14. Accepted-active participant messaging, moderation hiding, disconnect/report/block send denial, while messaging remains disabled for 10V.
15. Directional Instagram grant/revoke and disconnect/block/report revocation, subject to the P0 GET correction; Instagram remains disabled for 10V.
16. Fixed coarse analytics, hashed dual rate identities, `Retry-After`, Production missing-Redis fail-closed `503`, and no sensitive event payload.

## RECOMMENDED_10V_CONTRACT

1. Eligible Google-only account with complete private onboarding; no Email/Kakao/Naver or legacy profile authority.
2. `public_account_access_active` must be checked before page/API/RPC discovery writes, and `emergency_stopped` must dominate public and beta access.
3. Actor must own an active membership in the exact target school at search and again at request time. Actor graduation year need not equal target year.
4. Require target school, exact target graduation year and NFKC/trimmed exact name of 2+ characters; no partial, chosung, fuzzy, suggestion, list, count or profile card.
5. Return only one generic unavailable/non-match state or `match_available` with a hashed-at-rest, requester/receiver/membership-bound, ten-minute single-use opaque token. Do not reveal blocked, suspended, duplicate, prior-request or connected target state through search.
6. Use search limit 5/day per IP and account for the first release, preserve Production fail-closed Redis behavior, and document trusted proxy parsing.
7. Recheck requester and receiver active adult/onboarding, deletion, restriction, block and target/requester membership authority atomically at request creation; consume unsafe tokens without creating a request.
8. Permit one immutable greeting only after practical external-contact obfuscation coverage is strengthened. Natural-language self-identification remains allowed.
9. Before acceptance expose only masked sender identity, relationship, greeting, request control ID/time and the receiver's own matched school/year. Never expose user/Auth/profile ID, email, provider identity, Instagram or sender school history.
10. Only the receiver may accept/decline/wrong-person/block/report. Acceptance atomically rechecks both parties' current eligibility and creates exactly one connection.
11. Emergency/feature stop blocks new search/request/reminder/accept writes while receiver decline/wrong-person/block/report and participant disconnect/report remain available as safety closure actions.
12. Keep messaging and Instagram disabled for the first 10V release. Fix Instagram GET gating before any later permission rollout.
13. Preserve service-role-only mutation, FORCE RLS, participant object authorization, coarse analytics and zero raw search/contact payload logging.
14. Re-run the disposable 17-scenario matrix, deletion/suspension/emergency, greeting bypasses, token expiry/replay/concurrency, RLS/grants and IDOR before any narrow Preview activation.

## Explicitly deferred

- Public activation, Production rollout and feature-flag changes
- Messaging, Instagram permission/display and real-time/attachment features
- Suggested classmates, school member lists, fuzzy/partial/chosung search and membership counts
- Unregistered-person invites, shadow identities, email/provider/Instagram lookup
- Reset/reopen policy after decline, wrong-person, block or report
- PHASE 10V runtime/schema implementation
