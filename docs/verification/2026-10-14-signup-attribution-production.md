# 가입 유입 통계 Production release

## 승인/범위

사용자는 PR #131 merge, migration081007/090650/101616 Production 적용과 배포를 승인했다. Preview 보호 예외/자동화/키/환경 설정 변경은 범위에 없으며 실행하지 않는다. 2026-10-15 최신 결정: 직접 테스트 생략, 첫 실제 가입 주에 주간 대조로 확인한다. 새 Google 계정과 인위적인 Production 가입은 만들지 않는다.

## 적용 전 기준

- main4fe00992c0878241d0aa300905735b079d65470d, 기존 정상 Production dpl_7ZVEEbkmjBMKwc5Ai98pQDxDmeXo (rollback candidate).
- Production ucnybhzpbatzcipwqtox: signup_attribution와5인자 wrapper 없음, 기존3인자 owner RPC 존재/hash f88042ec97b3f6a3007b389b00c87916.
- 기존 Auth3/프로필3/최초 프로필 milestone3. launch open, registration/profile/school 모두true. 기존 기록은 보존한다.
- 동일 runtime의 마지막 검증: 대상35 tests, TypeScript, 전체1767 PASS/기존4skip, 68route build, fresh081007→090650→101616 및 upgrade/오류 분리 DB matrix PASS. Preview noindex/robots 확인 완료. 자동 E2E와 실제 Google 가입 미완료는 유지한다.

## 배포/검증 checkpoint

- Production 세 migration과 동일 버전 이력을 하나의 guarded BEGIN/COMMIT transaction으로 적용 완료. 기존 적용 파일은 수정하지 않았다. Management API를 사용해 CLI와 동일한 원본 version/name/statements를 기록했고 추가 버전은 만들지 않았다. 로컬 helper의 PREVIEW_QUERY_APPLIED 문구는 역사적인 출력 라벨이며 실제 ProjectRef는 승인한 Production ucnybhzpbatzcipwqtox였다.
- 원격6열/NULL-equal 고유키/양수count/코드 check/RLS/정책0/client CRUD·RPC 없음/server INSERT·UPDATE·RPC 있음/server DELETE 없음 확인 PASS.
- 배포 전 targeted35 tests 및 npm run typecheck 재실행 PASS, git diff --check PASS. runtime 변경이 없고 기존 전체1767/build68/fresh DB 검증을 보존해 불필요한 전체 재실행은 하지 않았다.
- PR의 최신 수동 주간 SQL/보고 수정도 포함한다. merge/실제 Production 배포 결과는 후속 checkpoint에 기록한다.

## Merge checkpoint

- PR131의 최신aebb232 검사2개 SUCCESS 확인 뒤 --match-head-commit 가드로 squash merge 완료. main commit cc63d02b4965ce7dff29d6c77281eeedcbc6b6e7, mergedAt2026-10-14T11:34:22Z.
- `git diff --exit-code HEAD origin/main` PASS: 검토한 PR tree와 실제 main tree 동일. 기존 원본 checkout은 switch/reset하지 않았다.
- 원본 owner RPC hash f88042ec97b3f6a3007b389b00c87916 유지, best_effort=true, Auth3/profiles3/funnel3, signup0. 기존launch open 유지. 테스트 예약 코드 사전 합계0.
- Vercel Production dpl_FigncnSANVwLdBtpLZ5hmhXLbkny 빌드 시작, commit 일치. 최종 READY/서비스 확인은 다음 checkpoint에 기록한다.

## 테스트/되돌리기

**현재 검증 방식: 직접 테스트 생략, 첫 실제 가입 주에 주간 대조로 확인.**

첫 실제 가입이 발생한 주가 끝난 다음 주에 운영자가 `scripts/signup-attribution/weekly-check.sql`을 수동 실행한다. 이 SQL은 지난 온전한 KST 월요일~일요일의 기존 최초 프로필 milestone 합계(`new_profiles`)와 `signup_attribution`의 `SUM(count)`(`attributed_signups`)를 비교한다. 두 값이 같고 `difference=0`인지 확인한다. 집계 줄 수(`attribution_rows`)는 유입 코드 조합 수여서 가입 수 대조에 사용하지 않는다. 최초 배포 전/부분 적용 기간은 별도 해석한다. 실제 가입이 없는0=0 결과만으로 가입 흐름을 검증 완료했다고 표시하지 않는다.

자동 일정은 만들지 않는다. 첫 실제 가입 집계가 생기기 전 상태는 Production schema/UI 확인 완료, 실제 가입 주간 대조 미실행이다. 합계 대조는 재로그인·수정·중복 방지까지 실제 서비스에서 직접 검증한 결과로 확대 해석하지 않는다.

이전에 제공한 `scripts/signup-attribution/production-test.sql`과 테스트 링크는 사용 계획을 취소했고 파일만 보존한다. 해당 파일의 DELETE를 실행하거나 테스트 계정을 생성하지 않는다. 기존 계정·일반 통계·임시 키·작업 자료는 별도 삭제 승인 전까지 보존한다.

1. 문제가 생기면 Vercel에서 이전 정상 Production dpl_7ZVEEbkmjBMKwc5Ai98pQDxDmeXo로 rollback한다.
2. DB/집계/migration 이력은 삭제하지 않는다. 기존3인자 owner RPC를 보존했으므로 이전 앱과 호환된다.
3. 수정은 후속 migration/PR로 검증해 재배포하며, 이전 기록을 지우거나 migration을 역순 실행하지 않는다.


## Production 최종 checkpoint — schema/UI verified, 첫 실제 가입 주간 대조 대기

- Vercel dpl_FigncnSANVwLdBtpLZ5hmhXLbkny READY, target=production, Next.js, main cc63d02b4965ce7dff29d6c77281eeedcbc6b6e7. buildingAt1791977667188→ready1791977762528 약95초. www.schoollove.kr / schoollove.kr alias 연결, aliasError=null.
- 실제 Chrome 별도 headless context에서 홈200, source=test 최초 유입 코드5필드(코드4+ts) 보관/페이지 이동 유지, 개인정보 방침 최대7일·일별 합계 문구, Google 로그인 버튼 존재 확인 PASS. Google 버튼을 누르거나 가입을 수행하지 않았다.
- Production robots Allow:/ + sitemap 존재, 홈에 전역 noindex 없음. 익명 GET /api/account/profile401, /.well-known/openid-configuration200+issuer 존재. 브라우저 pageerror0.
- 이번 브라우저에서 Analytics 전송 payload는0개 관측되었으므로 실제 원격 Analytics UTM 전송 PASS를 주장하지 않는다. beforeSend 허용 목록은 단위 테스트로 검증된 상태다.
- 새 deploymentId로 지난15분 error/fatal runtime log 집계 조회: 반환된 그룹0. 배포 직후 짧은 확인 구간이며 미래 오류/실제 가입 성공을 보장하지 않는다. 별도 drain/자동 일정 설정은 이번 범위에서 검사·변경하지 않았다.
- Production 예약 테스트 코드 rows0/signups0을 다시 확인했다. SELECT만 실행했고 DELETE/실제 계정 가입/삭제는 하지 않았다. 당시 최초 프로필→재로그인/수정 count1은 미실행이었고, 2026-10-15 결정으로 직접 테스트를 취소했다. 첫 실제 가입 주의 주간 합계 대조로 확인한다.
- 마지막 변경은 release checkpoint 문서뿐이다. 앱 runtime은 merge tree와 동일하며 기존 migration/owner RPC/launch state/계정/원본 SNS·PWA checkout/환경/보호 설정을 보존했다. 추가 문서 checkpoint는 로컬 파일과 PR 설명에 기록하고 후속 main commit/PR은 만들지 않는다.
- 검증 명령: targeted npm test(35 PASS), npm run typecheck(PASS), git diff --check(PASS), git diff --exit-code HEAD origin/main(PASS, merge 직후), gh pr checks(2 SUCCESS), Chrome production-smoke.cjs(PASS), Production schema/permission/history/baseline SELECT 및 Vercel deployment/log 조회.
- 미실행: 실제 Production 가입·로그인 round trip·수정 후 count1/테스트 DELETE, 이 문서 변경 뒤 전체 앱 test/build 재실행. 직접 테스트는 생략하며 첫 실제 가입 주가 끝난 뒤 운영자의 수동 주간 대조 결과를 기다린다.

SNS 일지용 한 줄: 가입 유입 통계 운영 배포 완료 | 직접 테스트 생략·첫 실제 가입 주간 대조 대기 | 코드·DB 유지·남은 자료는 승인 전 보존


## 2026-10-15 — 검증 방식 변경과 남은 항목 읽기 전용 확인

- 최신 결정: 직접 테스트 생략, 첫 실제 가입 주에 주간 대조로 확인. 이 배포 기록 문서만 수정한다. 코드/SQL/migration/DB/환경/배포/보호 설정은 변경하지 않는다. commit·push·PR 수정·삭제 작업도 실행하지 않는다.
- Preview hukokfyphyrpfouazxhq: Auth2/프로필2, 이번 E2E 합성 표지 계정0, 테스트 집계 줄0/합계0, 전체 가입 집계0. 기존 두 계정은 테스트 여부 불명이며 보존한다.
- Production ucnybhzpbatzcipwqtox: Auth3/프로필3, 이번 E2E 합성 표지 계정0, 테스트 집계 줄0/합계0, 전체 가입 집계0. 계정 식별자·이메일은 조회/출력하지 않았다.
- preview.schoollove.kr의 shareable-link1개가 남아 있다. 만료는2026-10-15 17:50:03 KST. 링크 비밀값은 출력/저장하지 않는다. alias-protection-override0. 기능 브랜치 alias의 공유 링크0. 자동화 bypass는 앞선 생성 요청403으로 이번 작업에서 생성되지 않았다. 현재 전체 automation-key 목록은 읽기 API에 노출되지 않아 모든 기존 키가0이라고 단정하지 않는다.
- 이번 작업의 로컬 worktree3개(signup-attribution, signup-audit-main, signup-preview-test), 테스트/검증 스크립트·SQL·로그·PR 본문 임시 파일 및 Preview 테스트 배포/브랜치가 남아 있다. cleanup manifest signup-e2e-cleanup.json 없음. signup-attribution에는 이 문서와 기존 IMPLEMENTATION_LOG.md의 미커밋 기록이 남아 있다. 다른 기존 SNS/PWA 변경은 이번 정리 대상에 포함하지 않는다.
- PR131은 MERGED이고 해당 기능 브랜치의 열린 PR0. 관련 테스트 프로세스0, Docker 컨테이너(실행/중지 포함)0. 실행 중인 테스트/서버를 종료하거나 자료를 삭제하지 않았다.
- 검증: 두 DB의 집계/합성 표지 COUNT SELECT, Vercel alias metadata(키 값 제외), Git status/worktree/PR 조회, 프로세스·Docker·파일 존재 여부 확인. `git diff --check` PASS. 앱 테스트/build는 문서만 변경해 재실행하지 않는다.


## 2026-10-15 — 문서 PR 및 로컬 정리 승인

사용자는 배포/검증 기록 문서만 새 PR로 commit·push·merge하고, 임시 공유 링크를 즉시 철회하며, 키/세션 토큰 잔여와 커밋 여부를 검사한 뒤 이번 로컬 작업 폴더3개와 작업용 스크립트·로그·임시 파일을 정리하도록 승인했다. Preview 기존 계정2개와 배포는 보존한다. 코드/DB/schema/정식 테스트 스크립트/주간 SQL은 변경하지 않는다.

- preview.schoollove.kr의 기존 shareable-link를 regenerate=false로 revoke했다. 재조회에서 공유 링크0/alias-protection-override0, 연결 deployment dpl_AG6vgCMonTX1pRRAY2BsvCh8kS1C 유지. 비인증 GET은302/vercel.com으로 보호 화면을 유지한다.
- origin/main cc63d02에서 scripts/signup-attribution/weekly-check.sql 존재 확인. blob faeda242dbbd5bfb0cbca8d1bcd1d7a185448e3f. 문서 merge 뒤에도 동일 blob인지 확인한다.
- 정리 대상은 signup-attribution/signup-audit-main/signup-preview-test의 로컬 checkout과 이번 작업의 signup-* 자료다. 원본 growth-ux의 공용 supabase-preview-management.ps1 및 다른 SNS/PWA 자료는 보존한다. 저장소에 버전 관리되는 테스트 스크립트는 checkout 사본만 제거하고 main 파일은 유지한다.
- 검증 방식은 직접 테스트 생략, 첫 실제 가입 주가 끝난 다음 주에 기존 weekly-check.sql로 new_profiles=attributed_signups / difference0을 확인하는 수동 방식이다. 자동 일정이나 새 Google 계정을 만들지 않는다.


- 2026-10-15 cleanup audit: scanned3,165 local text files including this task's logs/temporary material and2,831 reachable Git text blobs. No real credential/session-token patterns found in task logs/temp or history. Named-token matches were reviewed synthetic/local placeholder fixtures in existing tests only. Matched values were not retained in the audit report. Scope excludes local .env values, dependency/build caches, binaries and unavailable/deleted files. Existing repository test fixtures are preserved.
