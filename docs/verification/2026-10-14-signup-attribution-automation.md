# 가입 통계 장애 분리·자동 Preview E2E·Preview 검색 차단

## 승인과 범위

사용자는 수동 가입 테스트와 보호 예외를 취소하고, 집계 실패와 프로필 저장 분리·자동 E2E 및 Preview 전용 검색 차단을 승인했다. Production 적용·merge는 하지 않는다. 기존2개 계정·학교 이력은 보존한다. 이전의 개방/1시간 복원 계획은 실행하지 않는다.

## 구현

- 새 migration `20261014101616_signup_attribution_best_effort.sql`만 기존5인자 service-only RPC를 교체한다. owner 검증·프로필 저장·최초 milestone은 바깥 transaction에 두고 통계 검증/UPSERT만 EXCEPTION 하위 transaction으로 분리한다. 통계 오류/query cancellation은 attribution_recorded=false, 프로필 성공으로 반환한다. 진짜 인증·성인·동의·프로필 오류는 계속 실패한다.
- NULL 동등 고유 키·원자적 UPSERT·최초 milestone lock은 유지한다. 통계 실패 후 수정·재로그인은 재집계하지 않는다. 개인정보를 연결한 재시도 queue나 ID mapping은 만들지 않는다. 일시 장애 때 합계 누락은 가능하다.
- `scripts/signup-attribution/matrix.sql`은 AFTER INSERT/UPDATE 통계 trigger의 강제 오류 뒤 프로필·milestone 보존, 합계 rollback, 후속 수정의 no-count를 확인한다. 진짜 owner 오류는 실패함을 별도 검사한다.
- `app/api/account/profile/attribution.test.ts`는 통계 실패를 나타내는 saved profile/false 응답이200으로 성공하고 onboarding sync도 계속되는지 검사한다.
- `app/robots.ts`: VERCEL_ENV=preview에서만 User-Agent:* Disallow:/, sitemap 미제공.
- `next.config.ts`: Preview에만 모든 경로 X-Robots-Tag:noindex,nofollow,noarchive. production/local의 기존 robots·sitemap과 PWA header는 보존한다. `app/robots.test.ts`가 preview/production/development/미지정 모드를 각각 검사한다.
- Decision/FROZEN addendum/CHANGELOG, 구현 log 및 검증 문서를 갱신한다. 적용된081007/090650 migration은 보존한다.

## 로컬 결과

- 대상3files/35tests PASS, `npm run typecheck` PASS.
- `npm test -- --pool=threads --maxWorkers=2`: 216files/1767 PASS, 기존4skip 동일.
- VERCEL_ENV=preview + localhost placeholder의 `npm run build`: 68 routes 성공, 기존 무관한 lint 경고만 유지.
- 실제 Docker PostgreSQL fresh081007→090650→101616와 legacy3행 합산 upgrade matrix 모두 PASS. 첫 owner-error fixture는 DB가 허용하는1글자를 사용해 실패했으므로 실제 금지 입력인 빈 문자열로 수정한 뒤 전체 DB 검증을 재실행해 통과했다. 테스트를 삭제하거나 제품 검증을 약화하지 않았다.
- `node --check scripts/signup-attribution/preview-e2e.mjs`, 변경 코드 ESLint, diff check PASS. 스크립트는 Node ES module을 사용한다.

## Preview 적용과 세션 발급 사전 확인

- Preview hukokfyphyrpfouazxhq에 새 migration과 이력을 같은 transaction으로 적용했다. 이후 RPC 예외 처리 정의·migration 이력, 기존 Auth2/프로필2/가입합계0을 확인했다.
- Preview email provider와 anonymous auth는 disabled였다. 이 설정을 바꾸지 않고 Admin.createUser → Admin.generateLink → verifyOtp로 실제 Supabase 세션을 발급할 수 있음을 확인했다. 링크는 발송하지 않았고 합성 계정은 즉시 Admin.deleteUser로 정리했다. probe 후 기존 합계0으로 복구됐다. 일반 사용자 Email 로그인 UI/설정을 추가하지 않았다.

## 자동 E2E 실행 설계

`preview-e2e.mjs`는 Preview ref/domain을 상수로 제한한다. 기존 Windows Credential Manager의 Supabase CLI 인증으로 Preview 키를 메모리에서만 가져오는 로컬 bootstrap을 사용한다. `.env` 값을 읽거나 키/세션/원본 오류를 출력하지 않으며 인증 상태 파일·영상·trace를 만들지 않는다. Git에는 개인 정보·키·합성 계정 식별자와 유입코드의 연결 기록을 저장하지 않는다.

자동화용 Vercel bypass를 생성해 오직 preview.schoollove.kr 요청에만 header를 붙인다. 보호 예외/프로젝트 전체 SSO 해제는 하지 않으며 종료 후 해당 새 bypass를 revoke한다. 계정은 example.invalid 이메일·합성 app_metadata 표지로 생성한다. 관리자 링크는 메일을 보내지 않고 실제 세션을 발급한다.

UTM 진입 → 세션 cookie 설치 → 실제 owner API로 합성 성인 확인/동의 → 실제 계정 UI에서 최초 프로필 저장 → 로그아웃 → 새로 발급한 세션으로 재로그인 → UI 프로필 수정 → SQL에서 격리된 테스트 코드 count=1 및 전체 합계 delta=1 확인 순서다. 이는 요청한 관리자 세션 E2E이며 실제 Google OAuth/브로커 federation을 검증했다고 주장하지 않는다.

finally에서 자기 합성 표지를 확인한 계정만 삭제하고, 그 계정의 성인/동의/프로필 milestone이 만든 기존 funnel 합계 증가분만1씩 빼고, 격리된 테스트 signup bucket을 삭제한다. 나머지 행을 초기화하지 않는다. Auth·프로필·성인/동의 행 없음과 signup baseline 복원을 확인한다. 비상 정리용 합성 식별자 manifest는 ignored 로컬 폴더에만 잠시 두고 정상 정리 후 삭제한다. automation bypass도 실패 여부와 무관하게 revoke한다.

## 대조 방식 — 수동 주간 점검만

최신 사용자 지시로 매일 대조 계획은 철회했다. 자동 일정/작업은 만들지 않는다. 읽기 전용 `scripts/signup-attribution/weekly-check.sql` 하나로 지난 온전한 KST 월요일~일요일을 점검한다. 최초 프로필 생성 수는 삭제/재생성으로 흔들리지 않는 기존 milestone 합계이며, 집계 테이블의 줄 수와 SUM(count)를 함께 표시한다. 대조에 사용하는 값은 줄 수가 아닌 SUM(count)다. 적용 전/부분 적용 주간과 의도적인 테스트 합계 삭제는 차이를 만들 수 있으므로 해석에서 구분한다. Production에서는 별도 적용 승인 전까지 실행하지 않는다.

## 원격 배포/E2E/검색 차단 checkpoint

실제 실행 결과는 완료 뒤 이 절에 기록한다. Production·merge·보호 예외는 계속0이다.

### 최종 checkpoint — 0/3 완료, 요청한 자동 E2E는 접근 권한으로 BLOCKED

- Feature runtime commit6fac59fed5b0f5170685ec3bc2777a9961194df7, Preview commit84ca45417bce795fc748b2da66071a74c13aed6b. Preview에는 후속 commit만 cherry-pick해 merge를 실행하지 않았다. 두 tree는 동일하다.
- Vercel dpl_AG6vgCMonTX1pRRAY2BsvCh8kS1C READY, target=null, branch=preview; preview.schoollove.kr alias 연결을 확인했다. main4fe0099와 기존 로그인 설정15개는 그대로다.
- 로컬 컴파일 앱과 고정 Preview의 인증된 HTTP200 응답 모두 홈 X-Robots-Tag `noindex, nofollow, noarchive`, robots User-Agent:* / Disallow:/ / sitemap 없음 확인. production/local 유지 여부는4개 환경 단위 테스트로 확인했다. Production에 코드를 배포하거나 설정을 바꾸지 않았다.
- 자동화 전용 bypass 생성 요청은 Vercel API HTTP403 / `You don't have permission to create the protection bypass.`로 거절됐다. 매핑된 CLI fallback을 확인했으나 vercel/vc 실행 파일과 사용 가능한 캐시 CLI가 없었다. 같은 요청을 반복하거나 re-auth로 해결된다고 추측하지 않았다. 패키지를 설치하거나 다른 자격 증명을 임의로 찾지 않았다.
- 우회 키는 생성되지 않았고 실제 자동 E2E의 브라우저 최초 프로필→로그아웃→재로그인→수정→SQL count1은 미실행이다. 기존 share link를 Automation Bypass로 바꿔 부르거나 전체 E2E PASS로 기록하지 않는다. Admin/session probe만 PASS다. 준비한 ES module E2E는 syntax/lint 검증만 통과했고 전체 흐름은 아직 실행하지 않았다.
- SQL 최종: Auth2/프로필2/학교이력2, 합성 app_metadata 표지 계정0, signup 총합0, automated_e2e bucket0. 기존 두 계정은 보존했다. 실제 만들어진 probe 계정과 세션은 삭제 완료다. 전체 E2E가 시작되지 않아 정리할 새 자동화 키/집계행은 없다.
- 예외 override 없음, 비인증 GET /은302/vercel.com 보호 화면 redirect 유지. 보호 예외/global SSO 해제/Production 변경/이번 turn merge/결제 모두0. 로컬 서버 종료 완료. 새 키를 추가로 받아 쓰려면 운영자의 별도 안전한 키 제공/생성 절차가 필요하나 이번에는 사용자2번 지시에 따라 대조 계획만 제안한다.
- Supabase security advisor의 기존 WARN 네 종류(확장 위치, 공개/인증 RPC 권한, password 보호)는 이전과 같다. 새 wrapper의 anon/authenticated 실행은 계속 차단돼 있다. 참고: https://supabase.com/docs/guides/database/database-linter 와 https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

### 최신 지시 — 수동 Preview 테스트 준비 / DB 분리 확인

- 보호 예외와 자동 E2E는 실행하지 않는다. 현재 Preview Google 브로커 discovery/JWKS/token 경로도 Vercel 보호로302이므로, 브라우저에서 Vercel 로그인만 해도 전체 Google 가입이 된다고 보장할 수 없다. 예외 없이 수동 테스트가 완료되었다고 주장하지 않는다.
- Supabase 관리 API 확인: Preview `schoollove-preview` / `hukokfyphyrpfouazxhq` / `db.hukokfyphyrpfouazxhq.supabase.co` / ap-northeast-1; Production `schoollovei` / `ucnybhzpbatzcipwqtox` / `db.ucnybhzpbatzcipwqtox.supabase.co` / ap-southeast-1. 서로 별도 프로젝트와 DB다. Production 읽기 전용 조회에서 signup_attribution 부재, 세 버전081007/090650/101616 이력0건을 확인했다. 이번 적용 영향은 Preview뿐이다.
- Preview 기존 Auth 계정의 email 도메인과 KST 생성 날짜만 SELECT했다. 두 email 모두NULL이라 도메인은 미상이며 날짜는2026-08-29와2026-08-30이다. 전체 이메일/이름/식별자를 출력하거나 기존 계정을 삭제하지 않았다.
- 수동 테스트 예약 코드: source=test, medium=manual, campaign=preview_signup_test, content=manual_20261014. 시크릿 창에서 기존 Preview 프로필이 없는 Google 계정으로 최초 저장→재로그인→수정 후 아래 합계가1이어야 한다. 보호가 막으면 테스트를 멈춘다. 신규 테스트 계정 삭제는 해당 계정의 탈퇴 흐름이나 승인된 Auth Admin 절차를 사용한다. 익명 통계로부터 계정을 역추적하지 않는다.

```sql
-- 가입/재로그인/수정 뒤 같은 결과가 rows=1, signups=1인지 확인
SELECT count(*) AS rows, coalesce(sum(count),0) AS signups
FROM public.signup_attribution
WHERE source='test' AND medium='manual'
  AND campaign='preview_signup_test' AND content='manual_20261014';

-- 테스트 종료 뒤 Preview SQL Editor의 DB owner로 해당 익명 합계만 삭제
-- service_role에는 DELETE 권한이 없다. 원래 계정2개와 다른 통계는 보존한다.
DELETE FROM public.signup_attribution
WHERE source='test' AND medium='manual'
  AND campaign='preview_signup_test' AND content='manual_20261014';
```

- 위 DELETE는 제공만 하고 실행하지 않는다. 최초 프로필 milestone은 탈퇴 뒤에도 익명 합계로 남으므로 테스트 bucket을 지운 주에는 주간 difference에 테스트 수만큼 차이가 날 수 있다. 이를 맞추려고 기존 milestone을 임의로 지우지 않는다.
- 최신 변경은 점검 SQL과 문서뿐이다. 런타임/기존 migration/Production/보호 설정은 수정하지 않는다. Preview에서 주간 SQL 실행 PASS: 2026-10-05~2026-10-11 신규 프로필0 / 집계 줄0 / 가입합계0 / 차이0. 예약 테스트 코드의 사전 합계0 확인. `git diff --check` PASS. 문서/읽기 전용 SQL 변경만 있어 전체 앱 테스트와 빌드는 재실행하지 않았다. 이번 원격 작업은 SELECT/프로젝트 정보 조회뿐이며 DELETE·migration·배포·commit·push는 실행하지 않았다.

SNS 일지용 한 줄: Preview 테스트 절차와 주간 점검 SQL 준비 | 보호된 Google 인증 경로로 실제 가입 확인은 대기 | 보호 유지·자동화 보류·Production 별도 승인
