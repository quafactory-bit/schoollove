# 개인정보 고지와 삭제 자동화 배포 검증

## 범위와 승인

사용자: “응 진행해서 배포까지 완성해줘”.
[채택 결정](../decisions/2026-09-16-privacy-retention-release.md)을 기준으로 수집 고지,
책임자 박완/기존 이메일/070-8713-0423, 인증 정보 만료, 일반 탈퇴 식별정보 정리와 배포를 진행했다.
공급자의 미확정 로그·백업·Hobby 계약 조건은 추정하지 않았으며 고지에 그대로 구분한다.
이는 개인정보 법률 정비 전체가 완료됐다는 선언이 아니다.

## 구현과 변경 파일

- `app/privacy/page.tsx`, `lib/privacyNotice.ts`, `components/privacy/CollectionNotice.tsx`:
  시행일 2026-09-16, 필수/선택 수집 항목·목적·기간·거부 안내, 공급자별 조건과 권리행사.
- `app/account/AccountClient.tsx`, `app/login/page.tsx`, `lib/auth/social-broker/preview-recovery-http.ts`:
  동의·입력 전 고지, 기존 네 동의 항목과 과거 동의 버전 보존.
- `app/api/admin/public-account/route.ts`, 해당 runtime test: 실제 Auth 삭제 후 응답이 끊겨도
  검증된 null 연결 상태에서 finalization 재시도. 미확인/오류 결과를 성공으로 해석하지 않음.
- `lib/operations.ts`, 해당 test: 기존 인증된 일일 관리 경로에도 정리 호출·실패 전파.
- 새 `privacy_retention_cleanup` migration: service-only/DB-owner 정리 함수, 24시간 발송 제한
  참조 분리, 세션 제거, 15분 인증 재사용 방지 창 후 일반 탈퇴 식별자 정리, 일별 완료 건수만 90일.
  안전 제재와 미완료 Auth 삭제는 제외. 기존 migration 파일은 수정하지 않음.
- 새 `privacy_retention_schedule` migration: pg_cron 5분 예약, 실행 30초 제한,
  이 작업의 cron 실행 로그만 7일 후 정리. 신규 외부 서비스·비밀정보·유료 요금제 없음.
- `scripts/privacy-retention/*`: 합성 DB matrix 및 2세션 lock/retry 검증.
- 기존 암호문 변조 테스트의 비결정적 zero 대체를 XOR로 수정한 이전 변경을 함께 보존.
- Decision/FROZEN addendum/CHANGELOG/IMPLEMENTATION_LOG/초안 검증/제안서 연결 갱신.

보존한 기존 작업: `AGENTS.md` SNS 지침, SNS 로고 결정·SNS 운영 문서, Home shimmer 검증 기록.
공유 IMPLEMENTATION_LOG는 개인정보 관련 부분만 release에 포함하고 SNS 부분은 작업 트리에 보존한다.
패키지·lockfile·환경 파일·다른 기능의 공개 상태는 변경하지 않았다.

## 로컬 검증

| 실행 | 결과 |
| --- | --- |
| 운영 schema-only export, 새 disposable PostgreSQL 17 DB에 복원 | 개인 행 없이 구조만 복제 |
| `psql ... -f scripts/privacy-retention/disposable-matrix.sql` | PASS: Auth 존재 시 완료 거부, 세션 폐기, 실패/응답 유실 재시도, 중복 완료, 15분 보호 창, 일반 식별자 제거, live 계정·OTP 보존, 24시간 예산 참조 분리/만료, 90일 집계, 안전 hold, authenticated 실행 차단, 실제 RESTRICT leaf 의존성 |
| `node scripts/privacy-retention/lock-race.mjs` | PASS: 잠금 장벽 확인, locked 작업은 deferred, 잠금 해제 후 다음 실행에서 삭제 |
| 대상 Vitest 4 files | 21 PASS |
| `npm run typecheck` | PASS |
| `npm test -- --maxWorkers=2` | 208 files / 1,719 PASS; 기존 3 files / 4 SKIP |
| `npm run build` | PASS, 정적 페이지 67개; 기존 무관한 lint 경고 유지 |
| `git diff --check` | PASS; 기존 LF/CRLF 안내만 발생 |
| 로컬 `/privacy` HTTP·브라우저 | 200, 시행일·보호책임자·전화·고지 확인, console error 0 |

빌드와 로컬 Next 실행에는 localhost 더미 Supabase 주소/키와 비활성 이메일·Upstash 설정을
프로세스 범위에서 사용했다. 실제 가입·OTP·Auth 삭제 테스트는 실행하지 않았다.
Windows에는 pg_cron 실행 환경이 없어 로컬 SQL matrix와 운영 예약 실행 확인을 구분한다.
초기 fixture 시각/필수 status·reservation 값 오류는 수정한 뒤 새 schema-only clone에서 최종 matrix를 통과했다.
기존 종료된 로컬 탭의 연결 오류는 새 탭에서 실제 local build를 열어 해결했다.

## 운영 적용과 관찰

- 적용 직전: public account `open`, 개인 프로필 3, 학교 이력 2, 학교 10,006,
  만료된 로그인 시도 56, 일반 탈퇴 완료 정리 후보 0. 실제 개인 행은 조회하지 않았다.
- Supabase Production `ucnybhzpbatzcipwqtox`에서 두 migration이 각각 `success:true`를 반환했다.
- 후속 연결 도구 조회가 실패했고, 공식 CLI가 예정 점검 HTTP 503 및
  2026-09-16 06:45 KST 종료 예정을 반환했다. 관리 기능은 예정 시각 전에 복구됐고 아래 최종 검증을 마쳤다.
- 대체 조회 중 pgpass의 연결 메타데이터를 직접 읽는 명령은 자동 승인 검토에서 거절돼 실행되지 않았다.
  해당 방식은 중단했다. 이후 공식 CLI 기존 로그인으로 점검 사유만 확인했다.
- 적용 전 security advisor: 기존 informational private RLS/no-policy와 public pg_trgm,
  의도된 공개/owner RPC, 미사용 password login 관련 경고. 새 cleanup은 공개 실행을 허용하지 않는다.
  [Advisor 설명](https://supabase.com/docs/guides/database/database-linter).

## 남은 검증 / 한계

- 운영 배포와 cron 검증은 완료했다. 아래 최종 기록과 원격 migration 버전 파일명 정리는 사용자 추가 승인으로 Git에 반영한다.
- 공급자 내부 로그/백업 최대 기한 및 Vercel Hobby 처리계약의 별도 확인은 남는다.
  공급자 문의는 초안만 있고 발송하지 않았다. 유료 전환이나 계약 수락을 하지 않았다.
- 제재 hold는 안전 정책의 별도 판단이 필요해 일반 자동 파기에 포함하지 않는다.
  재시도·hold의 운영 확인과 24시간 처리 목표 준수는 계속 운영 책임에 속한다.

## 운영 웹 배포 확인

- [PR #119](https://github.com/quafactory-bit/schoollove/pull/119): Vercel Preview 두 검사 SUCCESS,
  MERGEABLE/CLEAN 확인 후 사용자 승인 범위에서 squash merge.
- 운영 commit `5daeaab5b110534a56e979253fbd0b9184c2c6d6`의 tree는 검증한
  release HEAD `03ec8a50cd9c2c6fae7cc7889dce3609dbe52c3b`와 동일하다.
  merge history 정렬은 기존 baseline tree가 동일함을 먼저 확인한 뒤 수행했다.
- Vercel Production `dpl_Gihig63yqXmFMhkU1gEYjNawihAc`: READY, alias error 없음,
  `www.schoollove.kr`/`schoollove.kr` 연결 확인.
- [운영 개인정보처리방침](https://www.schoollove.kr/privacy): HTTP 200,
  시행일 `2026-09-16`, 박완·기존 이메일·070-8713-0423 및 새 삭제 기준 확인.
- 모바일 390×844에서 가로 넘침 없음. 실제 `/login`에서 Google CTA보다 앞에
  인증 항목·보유기간·국외 이전 고지 링크가 표시됨을 확인했다.
- 실제 운영 로그인·이메일 발송·이용자 탈퇴는 실행하지 않았다.
- 브라우저 로그의 이전 localhost prefetch 실패는 운영 URL의 오류와 구분한다.
- 운영 `/privacy`·`/login`은 HTTP 200, 인증 없는 관리자 `/api/admin/public-account`는 HTTP 401.
  운영 URL의 browser console error는 0. 로컬 Next 및 disposable PostgreSQL 서버는 종료했다.
- 적용한 SQL 내용의 SHA-256은 cleanup
  `72D900D1E5B9729800F72C956B97AA9DC2673938C9D7A9400054CB6163CA1143`, schedule
  `B856F9466715F126CA0534CB346E3CD6B70013C3B1DA993F2D0D057A4B96A936`이다.
  원격에서 부여한 migration 버전과 파일명을 대조하더라도 이미 적용된 SQL 내용은 수정하지 않는다.
- 최종 검증용 별도 branch switch는 자동 승인 검토에서 별도 Git 전환 승인 부족으로 거절됐다.
  해당 보조 동작은 중단했으며 이미 완료된 merge/deploy는 영향을 받지 않는다.

## 운영 DB 최종 검증 — PRODUCTION_VERIFIED

- 공식 Supabase 연결 도구가 반환한 적용 버전은 cleanup `20260915211712`, schedule `20260915211726`.
  로컬 migration 파일명만 이 버전으로 정렬했고 SQL SHA-256 두 값은 위 적용 당시와 동일하다.
- `schoollove-privacy-retention`은 active, 5분 주기다. 2026-09-16 KST
  06:30/06:35/06:40 실행이 모두 `succeeded`이며 각 실행은 0.03초 미만이었다.
- 만료 로그인 시도 56 → 0. 만료 pending 인증번호와 24시간 경과 발송 예산도 0.
  운영 실제 탈퇴 요청을 새로 만들거나 Auth 사용자를 검증 목적으로 삭제하지 않았다.
- private profile 3, 학교 이력 2, 학교 10,006, account launch `open`을 그대로 유지했다.
- cleanup execute: anon=false, authenticated=false, service_role=true.
  비식별 일별 집계는 RLS/force RLS 모두 true, 세 외부 role의 직접 SELECT 권한은 모두 false.
- security advisor의 경고 종류는 적용 전후 동일하다. 새 cleanup에 공개 실행 경고는 없다.
  기존 pg_trgm/public, 의도된 public/owner RPC 및 password 보호 안내는 별도 기존 항목이다.
- 운영 방침과 자동 삭제는 검증 완료다. 공급자 미확정 사항은 상기 한계로 계속 남는다.
- 추가 Git 이력 병합도 자동 승인 검토가 승인 범위 부족으로 거절해 중단했다.
  이후 사용자가 “응 승인할게”로 최종 기록과 파일명 정리의 commit·push·merge를 명시적으로 승인했다.
  이 추가 승인 아래 기존 release 브랜치에 운영 main 이력을 정상 병합했으며 소스 tree는 동일하다.

## 최종 저장소 정리 범위

- 이 검증 문서, 개인정보 관련 IMPLEMENTATION_LOG 항목, migration 파일명 두 개만 반영한다.
- SQL 두 파일의 내용 해시는 적용 당시와 동일하다. 앱 소스·패키지·환경·DB 내용은 추가 변경하지 않는다.
- `git diff --check` 및 migration SHA-256 일치 검증을 실행했다. 코드 변경이 없으므로
  앞서 통과한 전체 테스트·타입 검사·로컬 빌드는 재실행하지 않는다. Git 연동 배포 결과는 별도 확인한다.
- SNS/Home의 기존 미커밋 기록은 이 후속 변경에 포함하지 않는다.
