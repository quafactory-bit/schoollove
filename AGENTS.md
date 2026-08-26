# SchoolLoveI 작업 규칙

> PHASE 10V 현재 결정: PHASE 10U의 사람 발견 P0 2개/P1 8개를 runtime·API·DB 방어선에서 폐쇄한다. 정확 검색은 actor가 target 학교 membership을 실제 보유할 때만 opaque token을 발급하고, 모든 유효 non-match/관계 상태는 하나의 generic unavailable 응답으로 수축하며 검색은 IP·account 각각 5회/일이다. `emergency_stopped`는 검색·요청·reminder·accept보다 우선하지만 기존 pending 요청의 decline·not-the-person·block·report와 기존 관계의 disconnect·report는 유지한다. 탈퇴 lifecycle, request-time 학교 authority, accept-time 양측 eligibility를 원자적으로 재검사하고 greeting의 실용적 연락처 우회와 Instagram GET 선행 조회를 차단한다. 새 migration은 기존 함수만 교체하며 table·column·function·route 증가는 없다. `people_search`, `connection_request`, `messaging`, `instagram_permission`은 계속 비활성이고 Preview migration 적용·Ready·merge·Production 변경은 별도 승인 전까지 금지한다.

> PHASE 10U 현재 결정: 사람 발견 readiness audit는 local/disposable 환경에서 완료했지만 public emergency 우회와 Instagram GET feature-gate 공백을 포함한 P0/P1 선행 수정이 남아 있다. `people_search`, `connection_request`, `messaging`, `instagram_permission`은 PHASE 10V 구현·재검증·별도 승인 전까지 계속 비활성 상태다.

> PHASE 10T 현재 결정: 첫 privacy-safe cold-start loop는 `/account`의 유효한 내 학교 card에서 membership과 무관한 공개 `/school/{encoded-slug}` 페이지를 공유하는 것이다. payload는 공개 학교명, `buildSafeMySchoolHref()` 결과와 현재 origin만 사용하며 졸업연도·반·Instagram·sender/membership/user/Auth ID, referral·tracking을 포함하지 않는다. Web Share 취소(`AbortError`)는 clipboard 복사로 바꾸지 않고, 공유·복사 telemetry와 client persistence를 만들지 않는다. 공개 학교 페이지는 개인화하지 않으며 사람 검색·명단·연결·메시지는 계속 닫혀 있고 신규 schema·API·route는 없다.

> PHASE 10S 현재 결정: `/account`는 Google-only 온보딩을 마친 사용자의 비공개 first-value home이며, 기존 owner-only `AccountState.memberships`로 본인의 학교명·유형·지역·졸업연도·선택 반을 보여 줄 수 있다. 학교 CTA는 DB relation의 유효한 slug로 만든 `/school/{slug}` 기본 경로만 사용하고 Year/Class 경로를 첫 가치 동선으로 사용하지 않는다. 공개 학교 페이지는 membership과 무관한 학교 기본 정보와 일반 `/account` 관리 CTA만 제공하며 개인화하지 않는다. 공개 사람 발견·명단은 계속 꺼져 있고 대표/선호 학교, 가짜 활동·인원·성장 수치, 신규 telemetry·schema·API를 만들지 않는다.

> PHASE 10R 현재 결정: `docs/decisions/2026-08-24-google-only-auth-policy.md`가 일반 사용자 인증의 최신 권위다. 유일한 사용자-facing 로그인 provider는 Google이며 `/login`에서 시작해 검증된 session으로 `/account`와 `/onboarding`을 이용한다. Kakao·Naver와 Supabase Email Auth는 지원하지 않는다. SchoolLove custom recovery email은 로그인과 분리된 소유권·중복 보호 경계로만 유지하고 OTP는 8자리다. 관리자 인증은 별도 경계다. 이 Preview 결정만으로 Production Google rollout은 승인되지 않는다.

> PHASE 10N-C2 현재 결정: disposable provider matrix에서 public `emergency_stopped`인데 active controlled-beta 사용자의 eligibility route가 200을 반환하는 우회를 발견해, 네 account write route와 onboarding writable 판정이 공통 `public_account_access_active` 선검사를 거치도록 수정했다. `closed`에서는 valid active beta 권한을 유지하고, `open`에서도 beta one-school 계약이 우선하며, emergency는 public/beta account 신규·수정 write보다 우선한다. 개인정보 owner 삭제와 탈퇴 요청 권리는 별도 경계로 유지한다. 최신 local 검증은 targeted 8 files/54 tests, full 114 files/1,008 tests, TypeScript, 58 pages/routes build, isolated 18 rollback 및 PHASE 10J/10N 회귀, disposable provider Chromium/mobile 360/390/412 각 5/5(총 20/20, workers=1, retries=0)다. 외부 이메일·Production Auth·Production mutation은 0이며 PR #39는 계속 Draft, Ready·merge·Production migration/deploy/open은 금지한다.

> PHASE 10N-B 현재 결정: PR #39는 Draft에서 공개 계정 경계를 강화한다. 미적용 migration `20260803120000`은 68→71 public-table/UUID person-link/Production post-reset 기준을 영구 DDL 전에 검증하고 전체 transaction으로 rollback한다. authenticated의 consent·deletion·private profile·membership 직접 write를 폐쇄하고 `auth.uid()` owner RPC만 사용한다. activity 요청량과 계정별 최초 milestone을 분리하고 `return_session`은 제거한다. 탈퇴는 public data 삭제→Auth Admin 실제 삭제→완료의 2단계이며 실패는 `failed_safe`, 비식별 운영 기록은 90일 후 파기한다. generic state RPC는 ready/open을 허용하지 않고 최신 immutable readiness와 별도 open RPC를 요구한다. Production migration·배포·환경 변경·실제 Auth/OTP·open·학교/beta/commercial mutation, PR Ready·merge는 계속 금지한다.

> PHASE 10N-A 현재 결정: 첫 controlled-beta 학교 선정은 중단하고, 방문→이메일 OTP→KST 만 19세 자기진술→필수 동의 4개→owner-only 비공개 프로필→본인 과거 학교 이력 최대 3개→계정 관리·탈퇴의 공개 계정 흐름을 먼저 완성한다. 공개 계정은 controlled beta와 분리된 `public_account_launch_control`만 사용하며 기능은 `account_registration`·`private_profile`·`school_membership` 세 개뿐이다. Production 기본값과 현재 상태는 계속 `closed`; migration 적용·배포만으로 open되지 않는다. 사람 찾기·연결·메시지·Instagram 공개·광고·결제·학교 선택·beta Draft/program/invite/member는 별도 승인 전까지 dormant/금지다. 적용 migration 수정, 실제 등록/OTP, Production mutation은 금지하며 PHASE 10N-A는 local·isolated DB·Preview·Draft PR까지만 허용한다.

> PHASE 10L-F 완료 결정: PR #37 merge commit `3d56ffe33c5f20abf44542c603bf3009708b5339`의 애플리케이션을 먼저 Production에 배포한 뒤 migration `20260802120000_legacy_person_data_reset.sql`을 적용해 `profiles`·`reports`·`traces`·`search_logs`를 모두 0건으로 초기화했다. `schools` 10,006개와 나머지 64개 public 테이블은 보존됐고 raw search persistence와 legacy public write는 영구 종료됐다. 기존 등록자는 조회·연락·전환·소유권 부여·초대·재사용하지 않으며, 다시 방문하는 사람은 성인 확인·동의·인증을 거친 신규 private account 구조만 사용한다. target school은 `TARGET_SCHOOL_PENDING_OPERATOR_DECISION`이며 실제 beta Draft·snapshot·allowlist·program-scoped flag·readiness·invite·member 생성은 별도 승인 대상이다. 최종 상태는 `PHASE_10L_F_PRODUCTION_LEGACY_PERSON_DATA_RESET_COMPLETE`다.

> PHASE 10J 완료 결정: migration `20260730100000_first_controlled_beta_safety_boundaries.sql`의 Production 적용, PR #35 squash merge, Vercel Production 배포와 비파괴 검증을 완료했다. 최종 상태는 `PHASE_10J_PRODUCTION_APPLIED_AND_MERGED_NO_BETA_DATA`다. 첫 실제 제한 베타는 새 snapshot-backed 프로그램만 사용하며 최대 20명·정확히 14일·학교 UUID 1곳·초대 1회/최대 7일·관리자 승인 대기·`account_registration`/`private_profile`만 허용한다. 프로그램은 항상 `paused`로 생성하고 별도 승인된 원자적 시작 RPC만 `active`로 전환한다. 긴급 중단 뒤에는 새 readiness와 별도 재활성화 승인이 필요하다. 실제 학교 선택과 Draft·프로그램·flag·초대·멤버 생성은 계속 별도 승인 전까지 금지한다.

> PHASE 10I 완료 결정: `docs/decisions/2026-07-29-controlled-beta-operations.md`에 따라 제한 베타 운영 도구는 관리자 전용·최소정보·10명 미만 마스킹·감사 원자성을 유지한다. migration `20260729190000`과 PR #32는 Production 적용·squash merge·배포 및 검증을 완료했다. synthetic mode는 명시적 비Production 플래그에서만 허용한다. 실제 프로그램 활성화, 초대 생성·발송, OTP·메시지·Instagram 권한·광고·결제 실행, Production 환경변수 변경은 계속 별도 승인 대상이며 모든 신규 프로그램은 최초 생성 시 `paused`여야 한다. 기존 공개 프로필의 수정·삭제·소유권 부여를 금지한다.

> PHASE 10D 승인 결정: `docs/decisions/2026-07-28-today-instagram-advertising-mvp.md`에 따라 무료 편집 추천과 유료 스폰서드를 분리하고, 만 19세 이상 본인 소유 Instagram 검증·운영자 수동 검수·수동 결제 확인·집계형 성과만 허용한다. PHASE 10D migration의 Production 적용·PR merge·Production 배포는 별도 승인 전까지 금지한다.
>
> PHASE 10H 승인 결정: `docs/decisions/2026-07-29-limited-launch-onboarding-growth.md`에 따라 공개 가입을 열지 않고, 성인 확인·필수 동의·해시 초대·운영자 승인·기본 비공개 프로필·과거 학교 이력의 제한 온보딩과 비식별 단계 집계만 허용한다. PHASE 10H migration의 Production 적용과 PR merge는 별도 승인 전까지 금지한다.
> PHASE 10H-R 승인 보완: 사람 찾기 중단은 새 안부 생성까지 연쇄 차단하고, 메시지 중단은 기존 연결의 대화 읽기·쓰기 경계에도 적용한다. 안전 신고·차단·연결 해제는 기능 중단 중에도 유지한다. 온보딩·성장 세그먼트는 10명 미만 정확한 수치를 반환하지 않는다.

> PHASE 10G 결정: `docs/decisions/2026-07-29-payment-provider-sandbox.md`에 따라 PortOne V2 sandbox와 mock provider를 준비한다. 결제 완료는 provider 재조회와 서버 주문 금액·KRW 일치 후 원자적으로만 반영한다. PHASE 10G migration·PR merge·Production credential/webhook/배포·실결제·실환불은 별도 승인 전까지 금지한다.

## A0. PHASE 10A/10B/10C 개인정보 안전 전환 — 최우선 계약

- 이 절은 아래의 기존 제품·FROZEN 계약과 충돌할 때 우선한다.
- 공개 `POST /api/profiles`와 제3자 등록은 계속 항상 차단한다.
- 공개 계정이 별도 승인으로 open된 뒤의 개인 등록은 Google 로그인으로 얻은 검증된 session, KST 기준 만 19세 이상 자기진술, 필수 동의, 본인 소유권을 모두 검증한 `/account` 경계에서만 허용한다. closed/internal_test/ready/emergency_stopped에서는 신규 Production Auth user 생성을 금지한다.
- 개인 정보는 기본 비공개이며, 상대방 승인 전에는 Instagram을 공개하지 않는다.
- 공개 사람 명단, 이름 검색, Year/Class 개인 카드와 개인 Instagram 노출을 금지한다.
- 학교명·지역·학교 유형 등 학교 기본 정보 검색은 유지한다.
- 기존 데이터와 관리자 신고·삭제 경계는 삭제하지 않되 공개 역할에는 profile 행을 반환하지 않는다.
- PHASE 10C 사람 발견은 학교·졸업연도·정확한 이름의 exact match 최소 상태만 반환하고 사람 목록, 부분/초성 검색, 결과 수와 receiver user ID를 노출하지 않는다.
- 최초 안부는 200자 텍스트 1회, 7일 후 기존 안부 재알림 1회만 허용하며 수락 전 추가 메시지를 금지한다.
- 수락된 연결의 500자 텍스트 대화만 허용하고 URL·이메일·전화번호·외부 ID, 첨부와 실시간 socket은 금지한다.
- Instagram은 연결 상대별 별도 승인 후에만 공개하며 취소·연결 해제·차단 시 즉시 비공개로 전환한다. Today Instagram 광고·결제는 PHASE 10D로 분리한다.

## A. 제품 최상위 원칙

- PHASE 10A 동안 SchoolLoveI는 안전한 학교 기본 정보 검색과 개인정보 전환 안내를 제공한다.
- 사람 발견·연결·메시지는 코드와 DB 경계를 보존하되 공개 계정 soft launch 기능으로 활성화하지 않는다.
- 페이지보다 필터를 우선한다.
- 등록보다 발견을 우선한다.
- 입력보다 기여를 우선한다.
- 레벨 숫자보다 사용자가 성장했다고 느끼는 경험을 우선한다.
- `/school/{slug}/{year}/{class}` 계층은 호환성을 위해 유지하되 Year/Class 개인 명단은 공개하지 않는다.

## B. Home 계약

- Home은 검색창 중심 랜딩 페이지가 아니다.
- Home은 공개 계정 launch state에 맞는 안전 안내를 표시하고, `open`에서만 성인 비공개 계정 시작 CTA를 제공한다.
- Home을 과거의 단순 학교 검색 화면으로 되돌리지 않는다.
- Home 활동에서 개인 nickname이나 Instagram을 직접 노출하지 않는다.

## C. Register Flow 계약

- legacy 공개 Register Flow와 `POST /api/profiles`는 영구 종료한다. 새 공개 계정은 별도 open 승인 뒤 `/login`→`/onboarding`→`/account`만 사용한다.
- 기존 등록 모듈과 성공 상태는 공개 UI에서 호출하지 않는다.
- PHASE 10B의 `private_profiles` 등록은 학교 성장·랭킹에 반영하지 않고 본인 전용으로 유지한다.

## D. 공개 사용자 UX 계약

- 일반 사용자 인증은 Google-only 경계만 사용한다. Kakao·Naver와 Supabase Email Auth를 사용자 로그인으로 다시 도입하지 않으며, 8자리 SchoolLove custom recovery는 별도 경계로 유지한다.
- 관리자 로그인은 일반 사용자 흐름과 분리된 별도 경계다.
- 공개 개인 Profile 페이지를 만들지 않는다. `/account`는 본인 전용 관리 화면이다.
- 공개 프로필, Year/Class 사람 목록, nickname 검색과 Instagram 노출을 금지한다.
- 이름 검색어를 URL query parameter로 노출하지 않는다.
- `/school/{slug}/{year}/{class}` URL 계층을 유지한다.
- 학교 기본 페이지는 개인 데이터가 없을 때만 index를 유지한다.
- search/submit/invite/Year/Class/Profile 성격의 경로는 noindex/nofollow/noarchive를 유지한다.

## E. FROZEN 문서

- `docs/design-package-v1.0`은 FROZEN 제품 기준이다.
- FROZEN은 영원히 수정 불가능하다는 뜻이 아니라, 사용자 승인과 Decision 기록 없이 변경할 수 없다는 뜻이다.
- 편의를 위한 임의 UI/UX 변경을 하지 않는다.
- FROZEN 문서에 없는 제품 결정을 코드에서 먼저 구현하지 않는다.
- 새로운 제품 결정이 필요하면 구현을 중단하고 사용자에게 판단을 요청한다.
- 승인된 결정은 `docs/decisions`에 먼저 기록한다.
- 계약 변경이면 관련 FROZEN 문서와 `CHANGELOG`를 갱신한다.
- 실제 구현 완료 기록은 `docs/IMPLEMENTATION_LOG.md`에 남긴다.

## F. State D 계약

- State D = State C AND level >= 10 AND completion >= 60%다.
- State D의 기본 경계와 위 상수는 FROZEN 계약으로 보존한다.
- State D 전체를 미정 또는 삭제 대상처럼 취급하지 않는다.
- 보류된 것은 Completion의 세부 집계 구현과 State D freshness 조건이다.
- 보류된 세부 계산식을 임의로 추정하거나 구현하지 않는다.

## G. XP와 Level 계약

- 현재 P1에서 사용하는 잠정 XP 입력은 visible profile count다.
- 현재 구현에서는 공개 프로필 수를 cumulative XP 의미로 사용한다.
- 최종 XP Source와 이벤트별 가중치 모델만 보류 상태다.
- 흔적, 다양성, 재방문 등에 대한 가중치를 임의로 추가하지 않는다.
- 기존 레벨 계산과 레벨 비하락 계약을 제거하거나 변경하지 않는다.
- `lib/policy/levelPersistence.ts`의 저장값 우선·레벨 비하락 계약을 승인 없이 변경하지 않는다.

## H. 보안 및 개인정보 경계

- Home 활동은 익명으로 유지한다.
- 공개 화면과 공개 API는 profile 행, nickname, 졸업연도·반과 결합된 개인 정보, Instagram을 반환하지 않는다.
- 검색 로그의 개별 query 원문을 공개하지 않는다.
- 관리자 화면이나 보고서에도 불필요한 개인정보를 출력하지 않는다.
- service-role 클라이언트는 서버 전용으로 유지한다.
- service-role 모듈을 client component에서 import하지 않는다.
- 공개 write API는 production에서 rate limit이나 CAPTCHA 설정이 없을 때 우회하지 않고 fail-closed 해야 한다.
- 관리자 페이지의 middleware 보호만 신뢰하지 말고, 중요한 관리자 mutation route의 인증 경계도 유지한다.

## I. Supabase와 migration 규칙

- 이미 운영 DB에 적용된 migration 파일은 수정하지 않는다.
- 후속 DB 변경은 항상 새로운 migration 파일로 작성한다.
- Supabase 원격 적용은 사용자 승인 없이 실행하지 않는다.
- `supabase-schema.sql`을 최신 운영 스키마의 유일한 진실로 취급하지 않는다.
- migration 파일, 현재 코드, 원격 DB 상태를 함께 대조한다.
- `profiles_update_system` 같은 과거의 느슨한 초기 정책을 운영 기준으로 재적용하지 않는다.

## J. Git과 기존 변경 보호

- 모든 작업 시작 시 `git status --short --branch`를 확인한다.
- 사용자가 만든 기존 변경을 되돌리거나 덮어쓰지 않는다.
- 현재 미커밋 Phase 9 변경을 하나의 작업 범위로 보존한다.
- 허가 없이 commit, push, merge, reset, clean, restore, checkout, switch, stash를 실행하지 않는다.
- 자동 포맷이나 개행 변환으로 무관한 파일을 변경하지 않는다.
- LF/CRLF 일괄 변환을 피한다.

## K. 패키지와 환경변수

- 패키지 설치·삭제와 lockfile 변경은 명시적 요청이 있을 때만 수행한다.
- `.env`, `.env.local`, 토큰, 비밀번호, API key, service-role key의 값을 읽거나 출력하지 않는다.
- 환경변수 검사는 실제 값을 출력하지 않고 존재 여부만 확인한다.
- production 키를 자동 테스트에 사용하지 않는다.
- Turnstile 로컬 테스트는 공식 테스트 키만 사용한다.

## L. 테스트와 검증 순서

코드 변경 작업의 기본 검증 순서는 다음과 같다.

1. 작업 시작 전 Git 상태 확인
2. 변경 파일에 직접 관련된 대상 테스트
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. `git diff`와 변경 파일 목록 검토

- 테스트가 원격 DB에 write하지 않는지 먼저 확인한다.
- 테스트를 통과시키기 위해 기존 테스트를 삭제하거나 약화하지 않는다.
- 실제 실행하지 않은 검증을 통과했다고 기록하지 않는다.
- `npm run lint`는 현재 Next.js 구성에서 실제 동작 여부를 확인한 뒤 사용한다.

## M. 상태 보고 체계

기능 상태는 다음 단계로 구분한다.

- `CODE_PRESENT`
- `LOCAL_VERIFIED`
- `PREVIEW_VERIFIED`
- `PRODUCTION_VERIFIED`
- `BLOCKED`

코드가 존재한다는 이유만으로 production 검증 완료로 기록하지 않는다.

현재 Phase 9 CAPTCHA 상태는 다음과 같다.

- `CODE_PRESENT`
- `LOCAL_VERIFIED`
- `PREVIEW_UI_VERIFIED`
- `PRODUCTION_UI_VERIFIED`
- `PRODUCTION_END_TO_END_WRITE_NOT_TESTED`

Phase 9는 production에 배포되어 UI 검증까지 완료됐지만, 실제 production 등록 write는 검증하지 않았다.

## N. 과거 감사 결과 처리

과거 대화나 문서에서 발견된 문제는 현재 결함으로 즉시 단정하지 않는다.

다음 형식으로 관리한다.

`PRIOR FINDING — CURRENT STATUS UNVERIFIED`

현 HEAD에서 재현 또는 해소 여부를 다시 확인한다.

재검증 대상 예시:

- `profiles_update_system` 정책이 운영 DB에서 과도하게 열려 있는지
- `reports` 원문 SELECT가 anon에게 노출되는지
- 신고 등록 시 `report_count`가 실제 증가하는지
- 신고 3회 자동 hidden 경로가 실제 운영 DB에 존재하는지
- 관리자 mutation route 내부 인증이 유지되는지
- 운영 DB와 저장소 migration이 일치하는지
- traces API의 production Upstash 동작
- 중복 Supabase client 또는 GoTrueClient 경고
- sitemap lastmod
- 검색 페이지 title 중복
- 과거 메타데이터 문구
- `npm run lint` 실제 작동 여부
- 미사용 코드
- `IMPLEMENTATION_LOG`의 과거 누락

## O. 원격 변경 승인

다음 작업은 사용자 승인 없이 실행하지 않는다.

- commit
- push
- merge
- production 배포
- Vercel 설정 변경
- Cloudflare 설정 변경
- 환경변수 변경
- Supabase 원격 migration
- 원격 DB mutation
- 관리자 계정 또는 비밀정보 변경

## P. 최종 보고 형식

모든 작업의 최종 보고에는 다음을 구분해서 적는다.

- 변경 파일
- 변경하지 않은 기존 파일
- 실행한 검증 명령
- 실제 검증 결과
- 실행하지 않은 검증
- 원격 변경 여부
- 남은 위험 요소
- 사용자 승인이 필요한 다음 단계
