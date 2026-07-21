# SchoolLoveI 작업 규칙

## A. 제품 최상위 원칙

- SchoolLoveI는 학교 검색 서비스가 아니라 사람을 발견하는 서비스다.
- 학교는 사람을 발견하기 위한 시작점이다.
- 학교보다 사람을 우선한다.
- 페이지보다 필터를 우선한다.
- 등록보다 발견을 우선한다.
- 입력보다 기여를 우선한다.
- 레벨 숫자보다 사용자가 성장했다고 느끼는 경험을 우선한다.
- School → Year → Class는 각각 독립적인 목적지가 아니라 사람 명단을 좁히는 필터 계층이다.

## B. Home 계약

- Home은 검색창 중심 랜딩 페이지가 아니다.
- Home은 학교의 성장 이벤트가 흐르는 활동 피드다.
- 학교 등록, LEVEL UP, 흔적, CTA가 일정한 리듬으로 나타나는 구조를 유지한다.
- Home을 과거의 단순 학교 검색 화면으로 되돌리지 않는다.
- Home 활동에서 개인 nickname이나 Instagram을 직접 노출하지 않는다.

## C. Register Flow 계약

- Register Flow는 단순 데이터 입력 폼이 아니라 학교 성장 엔진이다.
- 등록 완료의 중심 메시지는 단순 “등록 완료”가 아니라 “당신 덕분에 학교가 성장했다”여야 한다.
- 등록 직후 학교의 레벨과 성장 상태를 다시 계산하는 현재 계약을 유지한다.
- LEVEL_UP / IMMINENT / NORMAL 성공 상태를 임의로 제거하거나 변경하지 않는다.

## D. 공개 사용자 UX 계약

- 일반 사용자 로그인이나 회원가입을 추가하지 않는다.
- 관리자 로그인은 일반 사용자 흐름과 분리된 별도 경계다.
- 독립적인 개인 Profile 페이지를 만들지 않는다.
- 공개 프로필은 Year/Class 사람 목록의 카드로 표시한다.
- Year/Class 명단에서는 공개 nickname과 공개 Instagram을 표시할 수 있다.
- 이름 검색은 nickname 부분 일치 계약을 유지한다.
- 이름 검색어를 URL query parameter로 노출하지 않는다.
- `/school/{slug}/{year}/{class}` URL 계층을 유지한다.
- 현재 SEO index/noindex 기준을 임의로 변경하지 않는다.
- 프로필 수가 3명 미만인 페이지의 기존 noindex 계약을 유지한다.

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
- Year/Class 사람 명단에서는 사용자가 공개한 nickname과 공개 Instagram만 표시한다.
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
- `LOCAL_VERIFICATION_PENDING`
- `PREVIEW_VERIFICATION_PENDING`
- `PRODUCTION_NOT_DEPLOYED`

현재 production에는 Phase 9 CAPTCHA가 포함되지 않는다.

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
