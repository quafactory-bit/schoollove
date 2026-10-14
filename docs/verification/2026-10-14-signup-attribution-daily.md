# 가입 유입 일별 합계 전환 및 Preview 도메인 계획

## 승인 범위와 결과

사용자는 일별 집계 전환, 방침 반영, 테스트·검증 문서 갱신과 Preview 재적용을 승인했다. Production 적용과 merge는 금지했고 preview.schoollove.kr 연결 변경은 방법·영향 보고 뒤 별도 승인 사항으로 지정했다. 기존 Git 발행·Draft PR·일반 Preview 배포 승인 범위에서 PR #131을 갱신한다.

상태: 코드·로컬 `LOCAL_VERIFIED`, Preview DB `PREVIEW_VERIFIED`. 실제 Google 신규 가입·재로그인 E2E는 미실행이다.

## 변경 파일과 저장 구조

- `supabase/migrations/20261014090650_signup_attribution_daily_aggregates.sql`: 기존 적용 파일을 보존하는 후속 migration. 테이블을 잠그고 기존 행을 날짜·네 코드별 합산 전환한다. 기존 합계는 보존하며 id·landing_path와 identity sequence를 제거한다.
- 현재 열은 정확히 `created_on date`, `source text`, `medium text`, `campaign text`, `content text`, `count bigint`다. count는 1 이상이다. text의 기존 형식/40자 제한은 유지한다.
- 고유 제약은 `UNIQUE NULLS NOT DISTINCT (created_on, source, medium, campaign, content)`다. 빈 코드(NULL)도 동일한 조합이면 한 행이다. 최초 가입 때 `ON CONFLICT ... DO UPDATE SET count = daily.count + EXCLUDED.count`를 실행한다.
- `lib/signupAttribution.ts`: 브라우저·서버 payload에서도 경로를 제거한다. 유효한 이전 기록은 코드·시각을 보존하고 경로만 버린다. 7일 경과 값은 사용하지 않으며 접근 시 삭제·갱신한다.
- `lib/signupAttribution.test.ts`, `app/api/account/profile/attribution.test.ts`: 새 payload와 이전 저장 데이터의 경로 제거 검사.
- `scripts/signup-attribution/matrix.sql`, `run-isolated-db.ps1`: 구형 행 3건→합계 3건/묶음 2개 전환, 동일/NULL 코드 upsert, 각 차원 분리, 권한, 재생성 중복 방지, 실패 롤백 검사.
- `scripts/signup-attribution/browser-check.cjs`: 코드만 저장·기존 경로 제거·첫 값 유지·7일 갱신·저장 차단 검사. 외부 요청 차단이 service worker에 우회되지 않도록 해당 검증 context에서 service worker를 차단한다. 앱의 PWA 코드는 변경하지 않는다.
- `app/privacy/page.tsx`: 승인 문구의 의미를 반영했다. “허용한 유입 코드만 분석에 포함하며, 최초 유입을 브라우저에 최대 7일 보관하고, 가입 건수는 날짜·유입 코드별 합계로만 저장해 개별 회원과 연결하지 않습니다.” localStorage에는 자동 만료가 없으므로 7일 지난 값은 다음 접근 때 삭제/갱신하고 집계하지 않는다는 설명을 함께 둔다. 역사적 동의 버전은 변경하지 않는다.
- Decision, FROZEN addendum/CHANGELOG, IMPLEMENTATION_LOG, 최초 검증 문서의 후속 기록 안내와 이 문서를 갱신한다.

기존 인증·프로필 API·AccountClient·학교·PWA·패키지·lockfile·환경 파일은 보존했다. 기존 migration `20261014081007_signup_attribution.sql`은 수정하지 않았다. 원래 작업 폴더의 미커밋 SNS/PWA 작업도 보존한다.

## 중복 방지와 탈퇴

통계 테이블에는 user_id, 해시, 연결 키, 외래키 또는 개별 가입 시각이 없다. 기존 계정의 adult_eligibility_records에 있던 최초 프로필 milestone을 잠가 최초 생성 여부를 판정한다. 이 계정용 기록 자체를 익명이라고 부르지 않는다. 통계에는 해당 키나 값을 복사하거나 연결하지 않는다.

프로필 삭제 후 재생성·수정·재로그인은 추가 집계하지 않는다. 회원 탈퇴 때 계정용 기록은 기존 탈퇴 경계에 따라 지워지며 익명 합계는 유지된다. 완전 탈퇴 후 신규 가입은 새 계정의 가입으로 집계될 수 있다. 탈퇴자를 영구 추적하는 ID/해시는 새로 만들지 않는다.

## 실행한 검증

- `npx vitest run lib/signupAttribution.test.ts app/api/account/profile/attribution.test.ts lib/security/launchMeasurementMinimum.test.ts --pool=threads --maxWorkers=2`: 3 files / 36 tests PASS.
- `npm run typecheck`: PASS.
- `npm test -- --pool=threads --maxWorkers=2`: 215 files / 1,762 PASS, 기존 3 files / 4 skip. 직전 감사에서 main 4fe0099도 1,732 PASS / 동일 4 skip임을 확인했다. 실패를 제외한 결과가 아니다.
- `npm run build`: 68 pages/routes 성공. 운영 키 대신 localhost placeholder만 사용, 기존 무관한 lint 경고 유지.
- `powershell -ExecutionPolicy Bypass -File scripts/signup-attribution/run-isolated-db.ps1`: PostgreSQL 17 실제 disposable DB에서 migration chain, 기존 행 합산 보존, 6열/sequence 없음, client 권한 차단, service role 호출, 최초 생성/수정/삭제 후 재생성, 동일 코드/NULL 코드 합계 증가, 5차원 분리, invalid 코드/count 제약, 통계 실패 시 프로필 롤백 PASS. 컨테이너 제거 완료. 기존 운영 dump를 요구하는 retention migration 2개는 기존 runner처럼 제외한다.
- 브라우저·diff 최종 결과는 아래 release checkpoint에 기록한다.

## Preview DB 적용·재검증

프로젝트 `schoollove-preview` (`hukokfyphyrpfouazxhq`)에 새 migration과 `supabase_migrations.schema_migrations` 이력을 한 transaction으로 적용했다. 사전 0행이라 삭제할 기존 테스트 데이터는 없었다. Production은 조회/변경하지 않았다.

원격 SQL 확인: 6열, RLS 활성, policy 0개, 5차원 NULL 동등 고유 제약, 기존 sequence 없음, 외래키 0, 새 migration 이력, 원자적 count upsert 모두 확인했다. anon/authenticated는 SELECT·INSERT·UPDATE·DELETE 및 5인자 RPC 실행 권한이 모두 없고 service_role만 SELECT·INSERT·UPDATE·RPC 실행 가능하다. Preview에서 같은 NULL 조합을 두 번 upsert해 count=2/한 묶음을 확인한 뒤 전체 transaction을 ROLLBACK했다. 재조회는 묶음 0개/합계 0이다. 원격 Auth 계정·실제 프로필은 생성하지 않았다.

Security advisor의 기존 WARN 네 종류(확장 schema, 기존 공개/인증 RPC, password 보호)는 유지된다. 신규 RPC의 공개 권한 경고는 없고 통계의 RLS/no-policy INFO는 의도된 차단 상태다. 관련 안내: [Database linter](https://supabase.com/docs/guides/database/database-linter), [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## preview.schoollove.kr 연결 계획 — 아직 실행하지 않음

### 현재 확인한 상태

- Vercel 프로젝트 `schoollove-kr`의 검증된 도메인이며 `gitBranch=preview`다.
- 현재 도메인 배포는 `dpl_FRqurf1KFYsmQGztZtawAJWT3DFB`, `schoollove-5btqk9p1k-quafactory-s-projects.vercel.app`다. 복구 대상으로 보관한다.
- Supabase Preview Site URL은 `https://preview.schoollove.kr/`, 허용 주소는 `https://preview.schoollove.kr/**`다.
- 코드의 Preview issuer·로그인 완료 주소도 이 도메인으로 고정돼 있다. 별도 feature URL에서 로그인하면 주소·쿠키 경계가 맞지 않는다.
- 환경변수는 값 없이 이름·target·gitBranch만 확인했다. 로그인 exposure·Google ID·broker/recovery 설정 15개는 preview 브랜치 전용이다. codex/signup-attribution에는 적용되지 않아 일반 feature URL의 Google 로그인은 아직 준비 상태다.

### 제안하는 실행 순서

1. 현재 도메인 대상과 15개 Preview 전용 환경설정의 브랜치 범위를 복구 기록으로 보관한다. 값을 읽거나 출력하거나 교체하지 않는다.
2. 해당 환경설정의 `gitBranch` 범위만 `preview`에서 `codex/signup-attribution`으로 임시 이동한다. Production target과 전 브랜치 공용 설정은 변경하지 않는다. Vercel edit API는 값 변경 없이 gitBranch만 변경할 수 있다.
3. 이 브랜치의 검증된 commit으로 새 Preview 배포를 생성한다. 일반 feature 배포는 이미 만들어져 있어도 환경설정 반영을 위한 재배포가 필요하다. READY, Preview DB 연결, Google 로그인 시작 주소를 확인한다.
4. 도메인의 브랜치 연결을 `codex/signup-attribution`으로 변경하고 새 READY 배포로 alias를 연결한다. Supabase 허용 URL·Google callback·DNS·Production 도메인을 바꿀 필요가 없다. merge도 하지 않는다.
5. 도메인에서 새 계정의 최초 프로필 생성 시 해당 날짜/코드 count가 1 증가하고 재로그인에는 늘지 않는지 확인한다. 테스트 후 이전 도메인 대상과 15개 설정의 gitBranch를 복구할 수 있다.

Vercel 공식 설명: [브랜치에 도메인 연결](https://vercel.com/docs/domains/working-with-domains/assign-domain-to-a-git-branch), [환경변수](https://vercel.com/docs/environment-variables).

### 영향 범위

- preview.schoollove.kr에서 보이는 앱 전체가 이 브랜치의 코드로 바뀐다. 통계 부분만 바뀌는 것은 아니므로 테스트 중에는 기존 Preview 작업과 동시 배포를 피한다.
- 기존 preview 배포는 보존되지만 15개 설정을 임시 이동한 동안 preview 브랜치로 새 배포를 만들면 로그인 설정이 빠질 수 있다. 테스트 창 동안 해당 브랜치의 자동 배포를 실행하지 않는다.
- Supabase Preview DB는 다른 Preview 배포와 공유한다. 실제 가입 테스트는 그 DB의 테스트 계정·프로필과 일별 합계에 기록된다. Production DB와는 분리돼 있다.
- 기존 Upstash 설정은 Production/Preview 공용 scope이며 일부 요청 제한 prefix에 환경 구분이 없다. 따라서 외부 기반시설까지 완전히 격리됐다고 주장하지 않는다. 작은 수의 가입 검증만 하고 반복 부하/이메일 발송 테스트는 별도 검토한다. 이번 전환에서 공용 키/요청 제한 설정은 변경하지 않는다.
- 주소를 유지하므로 기존 로그인 쿠키를 가진 브라우저에서 옛 세션이 이어질 수 있다. 신규 가입 검증은 새 브라우저 context와 테스트용 Google 계정으로 한다.
- Production 코드·DB·도메인·환경설정과 main/preview Git 이력은 변경하지 않는다. 고정 도메인의 기존 시험 사용자에게만 화면 교체 영향이 있다.

실행에 필요한 다음 승인: 위 15개 환경설정의 Preview 브랜치 범위 임시 이동, 이 브랜치의 재배포, preview.schoollove.kr 브랜치/alias 연결 변경. 현재는 어느 것도 실행하지 않았다.

## 남은 검증과 위험

실제 Google 가입 E2E, Vercel 분석 서버 수신/유료 UTM 보고 화면, 두 세션 동시 가입 실험과 물리적 localStorage 자동 파기는 미검증이다. NULL 동등 고유 제약과 원자적 upsert는 DB에서 확인했다. 통계는 브라우저 제공 코드이므로 정확한 고유 인원/광고 효과를 보장하지 않는다. UTM에는 개인 이름/아이디 대신 게시물용 공통 코드만 사용한다.

## Release checkpoint

- 실제 localhost Chrome: `BROWSER_PASS codes_only legacy_path_removed first_wins seven_day_refresh blocked_storage`. 초기 hydration과 서비스워커/요청 차단 간섭으로 첫 시도가 실패해, storage 검증 context에서 service worker를 차단하고 초기 요청 안정화를 기다리도록 보완했다. 앱 PWA 동작은 수정하지 않았다.
- localhost `/privacy` HTTP200과 날짜·유입 코드별 합계 문구 확인.
- 변경 코드 `npx eslint ...`와 `git diff --check` 최종 결과를 검토했다.
- 고정 Preview 도메인 전환은 별도 승인 대기다. 일반 feature Preview release 결과는 후속 checkpoint에 기록한다.

### 일반 브랜치 Preview 적용 확인

- Runtime commit `1ec8d7957c70078297c6060cb195bdbf33f5b0a3` push 완료. Draft PR #131의 설명을 최종 합계 구조로 갱신했다. GitHub connector는 integration 403을 반환했으나 기존 로그인된 gh CLI로 정상 갱신했다.
- Vercel `dpl_CcwfdJZvm9hF8kEww1xJZrZDAQWC`가 해당 commit에서 READY, `target=null`인 Preview다. URL: https://schoollove-9mviz3ivg-quafactory-s-projects.vercel.app . 인증된 Preview fetch의 `/privacy` 응답 HTTP200과 날짜·유입 코드별 합계/경로 미저장 문구를 확인했다.
- 변경 코드 ESLint 오류/경고0, `git diff --check` 통과. 실제 Google 가입은 이 URL에서 시도하지 않았다.
- 재조회한 preview.schoollove.kr의 gitBranch는 여전히 preview이고 도메인 updatedAt도 그대로다. 이번 작업에서 도메인·환경설정 mutation은 0이다. 실제 로그인은 위 별도 승인 후 고정 도메인에서 확인한다.
- 로컬 검증 서버를 종료했다. 원래 작업 폴더의 SNS/PWA 변경은 보존했다. Production DB/migration/deployment와 merge는 수행하지 않았다.

SNS 일지용 한 줄: 가입 통계를 일별 합계로 전환하고 Preview 적용 | 실제 로그인 확인은 도메인 전환 승인 대기 | 회원과 연결하지 않는 날짜·유입 코드별 합계만 저장

## 실제 가입용 고정 Preview — 후속 승인과 A 선택

사용자는 A/B 비교 후 preview에 미배포 작업이 없으면 A로 진행하도록 승인했다. 원격 fetch 뒤 preview HEAD는 1d355e29635b89069472a2d9d44191d289e28a24이고 현재 도메인 배포 dpl_FRqurf1KFYsmQGztZtawAJWT3DFB의 commit과 같다. 이후 미배포 commit은 0, preview를 사용하는 별도 local worktree도 없었다.

- A는 기존 preview 브랜치의 로그인 설정과 도메인 연결을 유지하며 기능 브랜치를 merge해 배포한다.
- B는 미배포 preview 작업을 그대로 둬야 할 때 로그인 설정 15개의 적용 브랜치를 임시 이동하고 도메인을 옮기는 방식이다. 이번에는 A 조건을 충족하므로 B는 실행하지 않는다. 비밀값 백업/읽기나 환경변수 범위 변경도 필요 없다.
- 두 브랜치는 과거 squash 이력 때문에 많은 중복 충돌이 있다. 별도 signup-preview-test 작업 폴더에서 최신 기능 브랜치 쪽 변경을 우선해 merge했고, 유일하게 남은 앱 차이는 옛 미사용 초대 상태 4줄이었다. 이를 제거한 결과 앱/테스트/마이그레이션 파일은 검증된 기능 브랜치와 일치한다. 원래 preview commit과 배포는 복구 참조로 보존한다.

### 0번 사전 확인

RPC의 증가는 하나의 `INSERT ... ON CONFLICT ... DO UPDATE SET count = daily.count + EXCLUDED.count` SQL이다. INSERT는 count를 인자로 받지 않아 기존 DEFAULT 1이 적용된다. 따라서 EXCLUDED.count는 항상 1이며 read→별도 update가 아니다. 날짜와 네 코드의 NULL 동등 unique constraint가 충돌을 처리한다.

새로 만든 disposable DB에서 선행 schema/migration을 구성하고 20261014081007→20261014090650을 순서대로 적용하는 fresh 경로를 runner에 추가했다. 기존 3행을 합산하는 upgrade 경로도 별도로 유지한다. 검증 완료 결과와 배포 ID는 다음 checkpoint에 기록한다.

테스트 전 SQL 기준값은 전체 합계0, 지정 코드 threads/post_body/preview_signup_test/1014-manual의 합계0이다. 실제 가입·재로그인은 사용자가 직접 수행한다. 완료 통보 뒤 날짜·네 코드·count 및 전체 SUM(count)만 조회하며 개인 정보나 계정 연결 키는 조회하지 않는다. Production/main/PR merge는 금지한다. 이번에 승인된 merge 대상은 preview 브랜치뿐이다.

### Fresh migration 확인 결과

`powershell -ExecutionPolicy Bypass -File scripts/signup-attribution/run-isolated-db.ps1`에서 `SIGNUP_ATTRIBUTION_FRESH_CHAIN_PASS 081007_then_090650 empty_daily_table full_matrix`와 기존 `SIGNUP_ATTRIBUTION_DB_PASS upgrade_totals ...`를 모두 확인했다. 새 DB의 첫 migration 직후 통계는 빈 행 단위 테이블이며, 다음 migration에서 빈 일별 합계로 전환한 후 전체 권한/최초 가입/수정/재생성/NULL/차원/롤백 matrix를 통과했다. 별도 upgrade DB의 기존 3행 합산 보존도 통과했다. 모든 합성 DB는 컨테이너와 함께 제거했다.

Preview 통합본 대상4 files/49 tests와 typecheck PASS. 앱 파일은 기능 브랜치와 같으며 전체 테스트/build 후 발행한다. 이 기록만 추가한 feature 후속 commit에는 새 런타임 변경이 없다.
