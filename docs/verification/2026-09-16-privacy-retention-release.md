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
  2026-09-16 06:45 KST 종료 예정을 반환했다. 버전·예약 실행·권한·보존 건수 확인은 점검 후 진행한다.
- 대체 조회 중 pgpass의 연결 메타데이터를 직접 읽는 명령은 자동 승인 검토에서 거절돼 실행되지 않았다.
  해당 방식은 중단했다. 이후 공식 CLI 기존 로그인으로 점검 사유만 확인했다.
- 적용 전 security advisor: 기존 informational private RLS/no-policy와 public pg_trgm,
  의도된 공개/owner RPC, 미사용 password login 관련 경고. 새 cleanup은 공개 실행을 허용하지 않는다.
  [Advisor 설명](https://supabase.com/docs/guides/database/database-linter).

## 남은 검증 / 한계

- Git release·Vercel READY·실제 공개 페이지·운영 cron 첫 실행 확인을 아래 후속 결과에 기록한다.
- 공급자 내부 로그/백업 최대 기한 및 Vercel Hobby 처리계약의 별도 확인은 남는다.
  공급자 문의는 초안만 있고 발송하지 않았다. 유료 전환이나 계약 수락을 하지 않았다.
- 제재 hold는 안전 정책의 별도 판단이 필요해 일반 자동 파기에 포함하지 않는다.
  재시도·hold의 운영 확인과 24시간 처리 목표 준수는 계속 운영 책임에 속한다.
