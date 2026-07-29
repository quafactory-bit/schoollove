# 제한 베타 운영 Runbook

## 배포 전

1. main과 origin/main이 일치하고 실제 content diff가 없는지 확인한다.
2. 관련 테스트, TypeScript, 전체 테스트, Production build, `git diff --check`를 통과시킨다.
3. 격리 PostgreSQL에서 전체 migration과 `lifecycle-smoke.sql`, `permission-smoke.sql`을 실행한다.
4. Production 환경변수는 값이 아닌 존재 여부만 확인한다: Supabase URL/anon/service role, 관리자 비밀번호, Upstash URL/token, `CRON_SECRET`.
5. migration 전 공개 프로필 수와 PHASE 10B~10E 핵심 테이블 행 수를 읽기 전용으로 기록한다.

## 제한 베타 초대

1. `/admin/operations`에서 활성 프로그램과 비상 차단 상태를 확인한다.
2. 이메일 또는 도메인 제한이 필요하면 원문은 요청 순간에만 hash하고 DB에는 hash만 저장한다.
3. 발급 화면에 한 번 표시된 token은 별도 안전 채널로 전달한다. 로그나 문서에 남기지 않는다.
4. 사용자는 OTP 로그인, 성인 확인, 필수 동의 후 초대를 사용한다.
5. `pending_review` 회원을 운영자가 검토해 `active`로 승인하기 전 기능은 열리지 않는다.
6. 승인 범위를 벗어난 사용자에게는 초대를 만들거나 접근을 부여하지 않는다.

## 매일 확인

- 최근 maintenance 상태와 안전 오류 코드
- queued export와 pending/failed outbox 건수
- 401, 403, 409, 429, 500 집계 변화
- open critical incident
- 비상 차단 여부와 활성 beta 회원 수
- 만료 token·요청·견적·placement·원시 광고 지표 정리 결과

## 비상 중단

1. 개인 정보 노출, 미성년 위험, 소유권 우회 또는 대량 오류 증거를 먼저 보존한다.
2. 대상 프로그램을 emergency disabled로 전환한다.
3. 사용자 데이터 삭제·수정은 자동으로 수행하지 않는다.
4. 영향 경로, 최초/최근 시각, HTTP 상태, 재현 절차를 기록한다.
5. 원인이 제거되고 재검증된 뒤 명시적 운영 판단으로만 복구한다.

## Cron 실패

- 같은 날짜의 `run_key` 재호출은 안전하며 기존 결과를 반환한다.
- 실패 run은 `MAINTENANCE_FAILED`만 저장하고 내부 오류 원문이나 비밀값을 저장하지 않는다.
- Vercel Hobby cron은 하루 한 번이며 시간 정밀도를 보장하지 않는다. 긴급 운영은 관리자 확인 후 동일 endpoint를 인증된 방식으로 한 번 호출한다.

## 내보내기

- 사용자는 JSON 또는 CSV export를 한 번 요청한다.
- maintenance가 `ready`로 전환한 뒤 인증된 owner만 다운로드한다.
- ready 파일은 정책에 따라 만료되며 서버에 payload를 장기 저장하지 않고 다운로드 순간 구성한다.
- 상대방 식별자와 비공개 프로필은 포함하지 않는다.

## Production smoke

- 실제 OTP, 메시지, 프로모션 알림, 결제, 환불, 광고 노출을 발생시키지 않는다.
- `/api/profiles` 503, 관리자·health·cron 무인증 401, 공개 화면 200, 개인 경로 noindex를 확인한다.
- migration 전후 기존 공개 프로필 수와 기존 데이터 소유권이 동일한지 읽기 전용으로 확인한다.
