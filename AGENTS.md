# SchoolLoveI 작업 규칙

> PHASE 10D 승인 결정: `docs/decisions/2026-07-28-today-instagram-advertising-mvp.md`에 따라 무료 편집 추천과 유료 스폰서드를 분리하고, 만 19세 이상 본인 소유 Instagram 검증·운영자 수동 검수·수동 결제 확인·집계형 성과만 허용한다. PHASE 10D migration의 Production 적용·PR merge·Production 배포는 별도 승인 전까지 금지한다.

## A0. PHASE 10A/10B/10C 개인정보 안전 전환 — 최우선 계약

- 이 절은 아래의 기존 제품·FROZEN 계약과 충돌할 때 우선한다.
- 공개 `POST /api/profiles`와 제3자 등록은 계속 항상 차단한다.
- PHASE 10B 개인 등록은 이메일 OTP session, KST 기준 만 19세 이상 자기진술, 필수 동의, 본인 소유권을 모두 검증한 `/account` 경계에서만 허용한다.
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
- 사람 발견은 PHASE 10C의 상호 승인·차단·신고 경계가 완성된 뒤 재개한다.
- 페이지보다 필터를 우선한다.
- 등록보다 발견을 우선한다.
- 입력보다 기여를 우선한다.
- 레벨 숫자보다 사용자가 성장했다고 느끼는 경험을 우선한다.
- `/school/{slug}/{year}/{class}` 계층은 호환성을 위해 유지하되 Year/Class 개인 명단은 공개하지 않는다.

## B. Home 계약

- Home은 검색창 중심 랜딩 페이지가 아니다.
- PHASE 10A 동안 Home의 프로필 기반 성장 피드·랭킹·등록 CTA를 중단하고 안전 전환 안내를 우선한다.
- Home을 과거의 단순 학교 검색 화면으로 되돌리지 않는다.
- Home 활동에서 개인 nickname이나 Instagram을 직접 노출하지 않는다.

## C. Register Flow 계약

- PHASE 10A 동안 공개 Register Flow는 정비 안내만 렌더링하고 API는 fail-closed 503을 반환한다.
- 기존 등록 모듈과 성공 상태는 보존할 수 있으나 공개 UI에서 호출하지 않는다.
- PHASE 10B의 `private_profiles` 등록은 학교 성장·랭킹에 반영하지 않고 본인 전용으로 유지한다.

## D. 공개 사용자 UX 계약

- 일반 사용자 인증은 승인된 PHASE 10B 이메일 OTP 경계만 사용한다.
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
