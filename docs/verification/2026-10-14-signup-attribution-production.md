# 가입 유입 통계 Production release

## 승인/범위

사용자는 PR #131 merge, migration081007/090650/101616 Production 적용과 배포를 승인했다. Preview 보호 예외/자동화/키/환경 설정 변경은 범위에 없으며 실행하지 않는다. 실제 Production 가입은 운영자가 직접 수행한다.

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

## 테스트/되돌리기

`scripts/signup-attribution/production-test.sql`에 source=test 전용 링크와 확인/선택 삭제 SQL을 제공한다. 사전 합계0에서 최초 프로필 뒤1, 재로그인/수정 뒤에도1을 기대한다. 테스트 코드로 회원을 역추적하지 않는다. 신규 테스트 계정 삭제는 해당 계정의 탈퇴 흐름으로 별도 수행한다. 기존 계정과 일반 통계는 삭제하지 않는다. 테스트 통계를 삭제하면 durable milestone과 주간 합계의 차이에 해당 테스트 수가 남는다.

1. 문제가 생기면 Vercel에서 이전 정상 Production dpl_7ZVEEbkmjBMKwc5Ai98pQDxDmeXo로 rollback한다.
2. DB/집계/migration 이력은 삭제하지 않는다. 기존3인자 owner RPC를 보존했으므로 이전 앱과 호환된다.
3. 수정은 후속 migration/PR로 검증해 재배포하며, 이전 기록을 지우거나 migration을 역순 실행하지 않는다.
