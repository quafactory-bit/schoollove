# 가입 유입 채널 측정 결과

상태: `LOCAL_VERIFIED` / Preview DB·홈·방침 `PREVIEW_VERIFIED`. 기준: main `4fe0099`, 별도 작업 폴더 `signup-attribution`의 `codex/signup-attribution` 브랜치. 원래 작업 폴더의 SNS/PWA 변경은 보존했다.

## 구현과 변경 파일

- `components/PrivacySafeAnalytics.tsx`: first-touch 수집, Analytics URL 필터 연결
- `lib/signupAttribution.ts`: UTM 형식 검사, referrer 도메인 판정, 7일 규칙, storage 예외 처리, 서버 재검사, 민감 동적 경로 가림
- `app/account/AccountClient.tsx`: 프로필 저장 payload 전송 및 신규 집계 성공 후 storage 삭제
- `app/api/account/profile/route.ts`: 검증된 session ID로 service-only transaction RPC 호출
- `app/privacy/page.tsx`, `lib/privacyNotice.ts`: 승인된 유입 통계 안내와 설명 개정일 2026-10-14 반영. 역사적 동의 버전은 보존
- `supabase/migrations/20261014081007_signup_attribution.sql`: 익명 통계 테이블·RLS·grants·service-only RPC overload·주별 조회 SQL
- `lib/signupAttribution.test.ts`, `app/api/account/profile/attribution.test.ts`, `lib/security/launchMeasurementMinimum.test.ts`: 동작·기존 보안 계약 검사
- `scripts/signup-attribution/matrix.sql`, `run-isolated-db.ps1`, `browser-check.cjs`: 합성 DB와 로컬 브라우저 검증
- 이번 Decision, FROZEN addendum/CHANGELOG, IMPLEMENTATION_LOG와 이 보고서

가입 완료는 최초 비공개 프로필 생성이다. 기존 성인 확인 milestone 행을 잠그고 원래 owner RPC와 익명 INSERT를 한 transaction으로 수행한다. 계정 식별자는 권한 확인에만 쓰며 통계 행에는 남기지 않는다. 재로그인·프로필 수정·삭제 후 재생성을 중복 집계하지 않는다.

첫 경로는 쿼리·해시를 제거한다. 이름·토큰·학교 이력이 들어갈 수 있는 임의 동적 경로는 `/school/[redacted]` 또는 `/[redacted]`로 가린다. UTM 네 개는 정확한 소문자 영숫자/밑줄/하이픈 1~40자로 제한한다. 서버는 만료·불량·추가 필드 payload를 unknown으로 변환하며 ts를 저장하지 않는다.

## 실행 결과

- 대상 계정/유입 테스트 최초 4 files / 50 tests 통과. 최종 유입·API 2 files / 29 tests 통과.
- `npm run typecheck`: 최종 통과.
- `npm test -- --pool=threads --maxWorkers=2`: 최종 215 files / 1,761 tests 통과, 기존 3 files / 4 tests skip.
- `npm run build`: Next.js 15.3.8 성공. 실제 키 대신 localhost placeholder만 사용. 기존 무관한 lint 경고 유지.
- 변경 코드 대상 `npx eslint ...`: 오류/경고 없이 통과.
- `powershell -ExecutionPolicy Bypass -File scripts/signup-attribution/run-isolated-db.ps1`: 실제 PostgreSQL에서 migration upgrade, RLS, 클라이언트 CRUD·RPC 무권한, service-role 호출, 최초 한 줄 저장, 수정·재생성 중복 방지, unknown fallback, INSERT 강제 실패 시 프로필 롤백 통과. 합성 row rollback, 작업 컨테이너 제거.
- DB runner는 운영 스키마 dump를 요구하는 기존 privacy-retention migration 2개를 제외한 관련 migration chain을 사용했다. 전체 운영 dump 재현을 주장하지 않는다.
- `node scripts/signup-attribution/browser-check.cjs`: 컴파일된 localhost 사이트를 실제 Chrome에서 열어 요청한 UTM 예시 저장, 첫 값 유지, 7일 경과 갱신, storage 차단 시 페이지 정상 동작 통과.
- `git diff --check`: 통과.

첫 전체 실행의 구형 Analytics source 검사는 '쿼리 전부 제거' 계약 때문에 실패했다. 허용한 UTM 필터와 fragment 제거를 검사하도록 갱신했으며 새 동작 테스트에서 불허 쿼리와 이상한 UTM 제거를 별도로 확인했다. 테스트를 삭제하지 않았다.

## 미실행·한계

- 실제 Google 로그인부터 신규 계정 생성까지 이어지는 브라우저 E2E와 실제 계정 재로그인은 미실행. 브라우저 저장, API는 mock, DB는 실제 합성 계정 RPC로 각각 검증했다.
- 두 세션 동시 요청 실험은 미실행. 중복 방지는 기존 milestone의 row lock으로 직렬화하며 순차 반복·재생성을 DB에서 검증했다.
- Vercel 대시보드 보고와 실제 분석 서버 수신은 미실행. URL 필터의 동작 테스트를 통과했다.
- 유입은 브라우저가 제공하는 통계용 값이다. storage 차단·만료·잘못된 값은 unknown, referrer가 없으면 direct가 될 수 있다. 고유 방문자/정확한 광고 효과의 증거로 해석하지 않는다.

## 개인정보처리방침 확인과 승인된 문구 반영

`app/privacy/page.tsx` 4절의 '검색 매개변수 모두 제거' 문구를 UTM 코드 허용으로 변경하고 아래 제안의 내용을 후속 승인에 따라 반영했다. localStorage는 자동 만료하지 않으므로 실제 공개 문구는 '저장 후 7일 이내의 값만 사용, 7일이 지난 값은 다음 방문 때 갱신'으로 명확히 했다. 초기 제안:

> 방문 분석에는 형식 검사를 통과한 유입 출처·매체·캠페인·콘텐츠 코드만 포함하며, 그 밖의 검색 매개변수와 주소의 # 뒤 부분은 제거합니다. 최초 유입 코드와 안전하게 정리한 방문 경로를 브라우저에 최대 7일간 보관하고, 최초 프로필 생성 때 가입 날짜와 유입 코드·정리된 경로를 통계로 저장한 뒤 브라우저의 해당 값을 삭제합니다. 이 통계에는 계정 식별자·이메일·이름·학교·IP·브라우저 정보·전체 외부 방문 주소·가입 시각을 저장하지 않습니다. 브라우저 저장소를 차단해도 가입할 수 있습니다.

UTM에는 개인 이름·아이디가 아닌 게시물용 코드만 사용해야 한다. 문구 반영은 법적 판단 완료를 의미하지 않는다.

## 원격 변경과 운영자 다음 단계

- 후속 사용자 지시로 방침 반영, commit/push/Draft PR, Preview migration·배포가 승인됐다. 기존 인증·학교·PWA·패키지·lockfile·환경 파일과 Production은 변경하지 않았다.
- Supabase `schoollove-preview` (`hukokfyphyrpfouazxhq`)에 20261014081007을 transaction과 migration 이력으로 적용했다. 열 7개, RLS 활성, policy 0개, anon/authenticated table·RPC 권한 없음, service-role INSERT·RPC 허용, 기존 owner RPC 보존, milestone row lock과 통계 0행 확인.
- 최초 DB 조회는 MCP와 관리 API 모두 28P01로 실패했다. 재시작 요청은 휴면 응답으로 실행되지 않았으며 기존 Preview 앱 GET 후 DB 조회가 성공했다. 비밀번호·키·보호 설정 변경 없이 복구했다.
- 방침 반영 뒤 targeted 34 tests, TypeScript, 전체 1,761 tests/4 기존 skip, 68페이지 build를 다시 통과했다.
- 신규 키/외부 추적 도구/요금제 변경 불필요. B의 통계는 SQL로 조회한다.
- 승인된 Git 발행과 Preview 앱 배포 후 실제 가입/재로그인 검증 순서. 기존 세 인자 RPC는 보존해 DB 선적용과 이전 앱의 호환성을 유지했다.
- Preview 결과 확인 후 Production migration/배포와 merge는 별도 승인 대상이다.

공식 RLS/grants 참고: https://supabase.com/docs/guides/database/postgres/row-level-security

## Preview release checkpoint

- Feature commit `e8c9d505143d78b37e8c40ea16de29f03088f6da` push, Draft PR https://github.com/quafactory-bit/schoollove/pull/131 생성.
- Vercel `schoollove-kr`, team `quafactory-s-projects`의 `dpl_FWAGYR1u6c9HupGkfUhEoLDieisU`가 해당 commit에서 READY. `target=null`인 Git Preview이며 Production이 아니다.
- 검증 URL: https://schoollove-20qnob7e9-quafactory-s-projects.vercel.app . 홈·방침 HTTP200, 개정일 2026-10-14·유입 코드·7일 유효/다음 방문 갱신 문구 확인.
- `/api/account/profile` GET의 보호 접근 도구가 `deployment_authentication_required` 401을 반환해 앱 자체의 401까지 확인하지 못했다. 보호 설정은 변경하지 않았다. 실제 로그인 가입 E2E는 계속 미실행이다.
- Vercel 환경변수는 decrypt=false로 이름·scope만 확인했다. 이번 작업에서 환경변수·키·요금제 설정을 추가/변경하지 않았다.
- Supabase security advisor는 프로젝트 단위 INFO1/WARN4를 반환했다. 확장 schema, 기존 security-definer 권한, Auth password 보호 항목은 이번 변경으로 자동 수정하지 않았다. 신규 통계 테이블·함수의 anon/authenticated 무권한은 별도 SQL로 확인했다. 참고: https://supabase.com/docs/guides/database/database-linter 및 https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- 통계 테이블 0행. Preview에서 실제 Auth 계정·프로필·가입 통계 행을 만들지 않았다. Production DB/배포·merge는 수행하지 않았다.

SNS 일지용 한 줄: 가입 유입 측정·방침 반영·Draft PR·Preview 적용 완료 | 실제 가입 전체 확인이 남음 | 최초 유입을 7일간 기억하고 첫 프로필 생성만 집계하기로 결정
