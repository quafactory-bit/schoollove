# 개인정보 보관 근거 검토와 삭제 기준 제안

작성일: 2026-09-16. 상태: **근거 검토·제안 작성 완료 / 정책 미채택 / 구현·운영 적용 전**.

후속: 위 상태는 제안 당시 기록이다. 이후 사용자가 구현·배포를 승인했고,
[채택 결정](../decisions/2026-09-16-privacy-retention-release.md)과
[실행 검증](../verification/2026-09-16-privacy-retention-release.md)이 최신 상태를 설명한다.

## 1. 결론

사용자가 요청한 Upstash 지역과 Resend 요금제는 확인됐다. 이 두 항목을 다시 요청할 필요는 없다.
남은 일을 막연한 ‘확인 중’ 대신 아래 두 가지로 구분한다.

1. **서비스에서 해결할 일:** 탈퇴 뒤 남는 해시·로그인 식별자·완료된 삭제 작업을 실제로 정리하고,
   90일 파기 함수를 정기 작업에 연결한다. 아래 삭제 기준을 정책으로 채택한 뒤 코드·DB를 수정해야 한다.
2. **공급자에게 확인할 일:** 공개 문서에 최대 보관기한이나 적용 계약이 명확하지 않은 항목.
   특히 현재 Vercel Hobby에 공개 DPA를 적용할 수 있다고 단정하지 않는다. 문의 초안은 6절에 작성했다.

사진만 받으면 전체 배포가 바로 가능했던 것은 아니다. 앞선 안내는 서비스 내부 삭제 경계와
공급자 계약 확인을 충분히 구분하지 못했다. 이 문서는 그 범위를 구체화한 결과다.

## 2. 공식 근거로 확인한 공급자 기준

| 공급자 | 확인된 운영 조건 | 확인된 보관·계약 근거 | 남는 한계와 처리 방법 |
| --- | --- | --- | --- |
| Resend | 사용자 Billing 화면: Transactional 3,000 emails / $0, Free. 고객 데이터 저장 미국 | 이메일·로그 30일, 백업 7일. 모든 계정에 가입 시 DPA 적용. 서비스 계약 종료 후 잔여 고객 데이터는 90일 내 삭제 | 정상 이메일 보관과 SchoolLove 탈퇴는 다른 사건이다. 조기 삭제 요청은 공급자 지원 절차로 처리하고 공급자 확인 전 완료로 표시하지 않는다 |
| Supabase | 연결 메타데이터: 운영 `schoollovei`, 싱가포르, 조직 Free | Free API/DB 로그 1일. 유료 플랜의 일일 백업 기간은 Free에 적용하지 않는다. 계약 종료 후 30일 반환 기간이 끝나면 사본 삭제 | Free가 백업이 전혀 없다는 뜻은 아니다. 비활성 일시중지 시 최대 1년 복구 창이 있다. 내부 보안 로그·수동 외부 백업·지원 접근의 정확한 범위는 별도 확인 필요 |
| Upstash | 사용자 화면: `schoollove-ratelimit`, AWS Free, 도쿄 `ap-northeast-1`, Global | 앱의 하루 제한 카운터는 현재 라이브러리 기준 최대 48시간 1초 TTL. DPA는 계약 종료 후 지시에 따른 삭제와 백업 삭제 전 이용 제한을 규정 | TTL은 모든 저장매체의 물리적 삭제 보장이 아니다. 무료 DB는 장기 비활성 시 백업 후 보관될 수 있다. 추가 read region, 백업·서비스 로그 최대 기한은 문의 필요 |
| Vercel | 연결 메타데이터: Hobby, 운영 함수 `iad1` 미국 | 런타임 로그 조회 1시간. Analytics 방문 식별값 24시간, Hobby 보고 창 1개월. 공개 DPA는 Pro·Enterprise 대상 | 조회 창보다 분석 데이터가 오래 남을 수 있다. Hobby의 적용 처리계약과 기능별 보관·국가 범위를 먼저 확인한다. 업그레이드만 하면 모든 문제가 해결된다고 보지 않는다 |

출처:

- Resend [GDPR·보관·DPA 안내](https://resend.com/security/gdpr).
- Supabase [Free 가격표](https://supabase.com/pricing), [백업](https://supabase.com/docs/guides/platform/backups),
  [일시중지·복구](https://supabase.com/docs/guides/platform/free-project-pausing),
  [DPA 6.1·11.2](https://supabase.com/legal/customer-resources/data-processing-addendum).
- Upstash [DPA 11절](https://upstash.com/trust/dpa.pdf), [무료 DB 비활성 보관](https://upstash.com/docs/redis/help/faq),
  [Global과 read region](https://upstash.com/docs/redis/features/globaldatabase).
- Vercel [현재 DPA 1절](https://vercel.com/legal/dpa), [Analytics 보관 설명](https://vercel.com/docs/analytics/limits-and-pricing),
  [방문 식별값](https://vercel.com/docs/analytics/privacy-policy), [런타임 로그](https://vercel.com/docs/logs/runtime).

해석 주의:

- Upstash의 이전 보안 조치 문서에 있는 ‘클러스터 종료 후 최대 4주 백업’은 키별 TTL이나
  활성 Free DB의 모든 백업·로그 기한이 아니다. 이 수치를 전체 보관기간으로 재사용하지 않는다.
- Supabase 최신 관측 문서는 ClickHouse와 이전 BigQuery 로그 체계를 구분한다.
  과거의 ‘기본 US’ 안내만으로 현 프로젝트 모든 로그 국가를 확정하지 않았다.
- Vercel DPA의 과거 PDF 삭제기한을 최신 DPA나 Hobby에 대입하지 않는다.
- 위 계약 확인 필요성만으로 현재 서비스가 법 위반이라고 단정하지 않는다.

## 3. 현재 코드와 운영 DB에서 재확인한 공백

개인 행이나 계정별 잔존량은 조회하지 않았다. 다음은 **실제 함수 정의·스키마와 저장소의 정리 경로**에 관한 결과다.

| 경계 | 현재 확인 결과 | 필요한 보완 |
| --- | --- | --- |
| 탈퇴 준비 | `admin_prepare_public_account_deletion`이 프로필·성인확인·동의 삭제와 로그인 주체 차단을 수행한다 | 요청 직후와 관리자 처리 전 사이에도 해당 계정의 신규 이용·재연결을 차단하는지 회귀검증 |
| 복구 이메일 | `revoke_social_identity_for_deletion`은 이메일 암호문을 제거하지만 계정의 이메일 HMAC을 남긴다 | 삭제 완료 뒤 HMAC과 키 버전·검증시각의 보유 목적을 끝내고 정리 |
| 로그인 연결 | `social_identity_registry`를 revoked로 바꾸며 subject/digest는 남긴다 | 과거 콜백·토큰이 새 계정으로 이어지지 않도록 차단한 후 식별 기록 정리 |
| 삭제 작업 | 완료 처리 후에도 `auth_principal_cleanup_jobs.auth_user_id`가 남는다. account FK는 SET NULL이다 | 부모 계정 삭제만으로 끝내지 않고 완료 작업의 직접 식별값까지 제거 |
| 인증 시도 | OTP 단말 상태 전환은 비밀재료를 지우지만 만료시각 도달 자체가 정기 실행을 뜻하지 않는다. delivery 기록에는 HMAC이 별도로 있다 | 유효기간 만료 작업과 24시간 발송 제한용 기록 파기를 분리해 실행 |
| 90일 감사 파기 | `admin_purge_expired_public_account_deletion_audit` 존재. 운영 pg_cron 미설치, 다른 public/private 함수의 호출 참조 0개 | 실제 스케줄러 호출·실패 감시·재시도·기한 검증 연결 |

저장소의 `vercel.json`은 `/api/cron/operations`를 하루 한 번 예약하고 있으나
`lib/operations.ts`는 `run_phase10f_maintenance`, `run_phase10h_maintenance`만 호출한다.
현재 확인한 범위에서는 90일 파기 함수를 실행하지 않는다. 외부 수동 실행이나 저장소 밖 자동화의
존재까지 배제한 결과는 아니므로 ‘절대로 실행되지 않는다’고 단정하지 않는다.

관련 코드:

- `supabase/migrations/20260908050649_public_account_launch_safety.sql`
- `supabase/migrations/20260810160000_social_account_recovery_boundary.sql`
- `supabase/migrations/20260810182000_social_login_attempt_decision_boundary.sql`
- `supabase/migrations/20260811110000_recovery_delivery_state_boundary.sql`
- `supabase/migrations/20260803120000_public_account_soft_launch.sql`
- `app/api/admin/public-account/route.ts`, `app/api/cron/operations/route.ts`, `lib/operations.ts`

## 4. 권장 삭제 기준 — 운영자가 채택할 안

법의 기준은 불필요해진 개인정보의 지체 없는 파기다. 아래 5분·24시간은 **제안하는 운영 목표**이며
법정 유예기간이나 이미 구현된 보장으로 안내하지 않는다.
[개인정보 보호법 제21조](https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0021&lsiSeq=283839&urlMode=lsScJoRltInfoR).

| 대상 | 권장 기준 | 실패·예외 경계 |
| --- | --- | --- |
| 이름·소개·학교 이력·Instagram·복구 이메일 암호문 | 확인된 본인 탈퇴 요청의 처리 과정에서 지체 없이 삭제. 정상 처리 완료 목표는 접수 후 24시간 이내 | 24시간 대기 후 삭제하는 정책이 아니다. 요청 즉시 이용 차단, 실패 시 재시도·운영자 확인. 완료 전에는 완료 표시 금지 |
| 복구 HMAC·로그인 subject/digest·완료된 삭제 작업 | Auth 실제 삭제, 관련 세션·진행 중 인증 무효화와 참조 정리가 확인되면 같은 완료 과정에서 제거 | ‘부정가입 방지’라는 추상적 이유로 모든 탈퇴자 식별자를 무기한 보관하지 않는다. 미완료 작업에는 처리에 필요한 최소 식별자만 제한 접근으로 유지 |
| OTP·이메일 인증의 비밀재료 | 사용·취소 시 즉시 제거. 미사용 OTP는 10분 만료 뒤 정상 운영에서 5분 이내 정리 목표 | 인증번호 만료 즉시 사용할 수 없게 하고, 비밀재료 정리는 별도 작업으로 검증. 공급자 메일 본문의 30일 보관과 구별 |
| 이메일 발송 제한용 HMAC·종료된 인증 시도 | 발송 제한은 마지막 예약시각부터 24시간만 판단에 사용. 이후 5분 주기 정리 목표 | FK cascade로 24시간 제한 이력이 먼저 사라져 우회되지 않도록 순서를 설계. 비밀재료를 이 기간까지 연장 보관하지 않는다 |
| 탈퇴 운영 통계 | 개인을 다시 연결할 수 없는 날짜별 결과·사유 분류·건수만 최대 90일. 불필요하면 더 일찍 삭제 | user/account/subject/email HMAC/request·job 연결 ID와 원문 사유를 제거. 소수 집계 노출 방지. 단순 해시를 익명정보라고 부르지 않는다 |
| 법령상 별도 보존·안전 신고 | 실제 적용 법령 또는 독립된 처리 목적, 대상 항목과 종료 조건을 개별 기록 | 일반 탈퇴자 전체에 관행적으로 3년·5년을 적용하지 않는다. 기존 차단·신고 보호 경계는 이번 정리로 임의 삭제하지 않는다 |

### 재가입과 보안

자발적 탈퇴자의 삭제 완료 뒤 재가입은 **새 본인 인증·새 동의·새 계정**으로 허용하는 안을 권장한다.
기존 연결·학교 이력·동의를 부활시키지 않는다. 제재 계정의 차단 정책은 별도로 유지한다.
이것은 현 영구 revoked 식별자 계약에 영향을 줄 수 있는 제품 결정이며, 정책 채택 전에 자동 구현하지 않는다.

브로커 ID token 코드의 300초만 보고 모든 Supabase 세션이 300초에 끝난다고 판단하지 않는다.
구현 때 실제 세션/refresh token 무효화와 기존 요청·재가입 경합을 검증한 뒤 식별자를 지운다.

### 백업

삭제된 이용자의 데이터를 복구본으로 다시 서비스에 노출하지 않는다. 복구는 격리 환경에서 진행하고
미완료 삭제를 재적용한 뒤 공개한다. 삭제 재적용에 필요한 식별값은 백업 수명 동안만 제한적으로
보관할 수 있으며, 그 경우 더 이상 ‘익명 90일 통계’로 분류하지 않는다.
공급자별 백업 최대 기간과 삭제 증빙 절차가 확정되기 전에는 ‘모든 사본 즉시 삭제’를 약속하지 않는다.

## 5. 구현·배포 완료 조건

### 서비스 내부

1. 위 정책의 채택을 Decision으로 기록하고 적용된 migration은 수정하지 않는다.
2. 새 migration에서 finalization과 범위 제한 purge를 보완한다. 살아 있는 계정, 실패한 Auth 삭제,
   유효한 인증 시도를 삭제 대상에 넣지 않는다. `oauth_login_attempts.account_id`의 RESTRICT와
   cleanup job의 SET NULL FK를 포함해 삭제 순서를 검증한다.
3. 5분 정리 목표를 지원할 실행기를 선정한다. 현재 Hobby cron은 일 단위이므로 그 설정만으로
   목표를 달성했다고 주장하지 않는다. 기존 일일 작업은 90일 통계 만료 점검에 연결할 수 있다.
   [Vercel cron 제한](https://vercel.com/docs/cron-jobs/usage-and-pricing).
4. 삭제 함수 자체가 신뢰된 서비스 역할만 허용하고, 청소는 시간·건수 제한과 재시도 안전성을 갖춘다.
   작업 실패나 누적 지연을 개인 정보 없이 확인한다. 실제 외부 알림 발송은 별도 범위다.
5. disposable DB에서 T-1초/T/T+1초 경계, 반복 실행, Auth 실패·완료 중단 후 재개,
   동시 로그인·재가입, 완료 작업의 잔존 UUID, cascade 제한 우회, 소유권·RLS 회귀를 검증한다.
6. 자동 파기는 신규 개인정보 삭제 동작이다. 고지 배포 승인만으로 기존 운영 데이터를 바로 지우지 않는다.
   검증된 migration과 대상 범위·dry-run 결과를 마련한 뒤 원격 적용 승인을 받는다.

### 고지와 동의

- 확인된 국가·요금제·공급자 표준 기간·책임자 정보는 사실로 사용할 수 있다.
- 새 운영 목표는 구현·검증 전 현재 사실처럼 개인정보처리방침에 넣지 않는다.
- 단순 연락처·누락 고지 정정이 언제나 전 이용자 재동의를 요구한다고 단정하지 않는다.
  반면 처리 목적 추가, 선택 정보의 필수 전환, 보유기간 확대, 동의를 근거로 하는 새로운 이전은
  각각 근거를 검토하고 필요한 사전 동의를 구현해야 한다.
- 기존 동의를 새 날짜로 재작성하지 않는다. 공유된 `ACCOUNT_POLICY_VERSION`을 단순 변경해
  기존 성인확인과 권한을 깨뜨리지 않는다. 새 동의가 필요하면 별도 버전 경계를 설계한다.
- 전체 고지가 아직 미완성이어도 확인된 책임자·연락처 등의 제한적 정정은 분리해 배포할 수 있다.
  그것을 전체 1·2·3 해결이나 법적 적합성 완료로 보고하지 않는다. 이번 작업에서는 분리 배포를 실행하지 않았다.

## 6. 공급자 문의 초안 — 작성 완료, 발송하지 않음

계정의 비밀번호·API 키·최종 이용자 정보는 포함하지 않는다. 답변 기한은 공급자가 정하므로
확정 날짜를 약속할 수 없다. 아래 세 문의는 정책 판단에 필요한 부분만 요청한다.

### Vercel 지원 / privacy@vercel.com

Subject: Hobby plan — end-user data processing terms and retention

We operate a Korean service on the Hobby plan, with production functions in iad1.
Your current public DPA states that it applies to Pro and Enterprise. Please identify the binding
data-processing terms available for Hobby end-user personal data, and whether a plan change or
separate agreement is required. Please provide the processing/storage countries and maximum
retention or deletion criteria for function request data, runtime logs, CDN/security logs and Web
Analytics, including backups. We need actual deletion periods, not dashboard reporting windows,
and the procedure for an end-user erasure request.

### Upstash 지원 / support@upstash.com

Subject: Free Redis in Tokyo — replication, backup and log retention

We use an AWS Free Redis database in ap-northeast-1 for expiring rate-limit counters.
Please confirm how to verify all configured read regions and where request/security logs are stored.
What is the maximum retention for expired-key data in persistence, backups and archived Free
databases? Please distinguish normal TTL expiry, inactivity archival, database deletion and contract
termination. Please also confirm the applicable DPA and how end-user erasure is completed in backups.

### Supabase 지원 / privacy@supabase.com

Subject: Free project in Singapore — internal logs and paused backups

We use a Free project in ap-southeast-1. We understand the published API/database log retention
is one day and that paused Free projects can be restored for up to one year. Please confirm the
locations and maximum retention or deletion criteria for internal security/traffic logs and backup
copies, including paused-project snapshots. How are individual end-user erasure requests handled
in those copies? Please identify applicable subprocessors for these data flows and the deletion
procedure while our service contract remains active.

## 7. 이번 실행 기록

- 실행: Git 상태 확인, 현재 코드·migration·cron 읽기, 공식 문서 검토,
  운영 DB 함수 3개 정의와 pg_cron 설치 여부·호출 참조 수·관련 컬럼 메타데이터 SELECT.
- 확인: pg_cron 미설치, 해당 purge의 다른 DB 함수 호출 참조 0개, 별도 잔존정보 정리 기한 컬럼 없음.
  코드에 cleanup job의 Auth UUID와 recovery delivery HMAC 잔존 경로 존재.
- 실제 이용자 행, 환경변수 값, 자격증명, 메시지 본문을 조회하지 않았다.
- 초기 Windows glob 경로 검색 일부는 실패했으며 `rg -g`/정확한 파일 경로로 필요한 근거를 다시 확인했다.
- 변경: 이 제안서, 기존 Decision/검증 기록/IMPLEMENTATION_LOG 연결.
  현재 앱 초안과 이전 test 수정, SNS/Home 기존 변경은 보존했다.
- 검증: 문서 diff·링크 경로 검토와 `git diff --check`. 앱 코드를 바꾸지 않아 npm test/typecheck/build는 재실행하지 않았다.
- 원격 변경·실제 파기·메일 발송·유료 전환·commit/push/merge/배포 없음.
- 기존 고지 배포 승인은 유지된다. 새 정책/재가입 결정과 실제 원격 DB 변경은 아직 승인되지 않았다.
  근거: `AGENTS.md` E의 ‘새로운 제품 결정이 필요하면 … 사용자에게 판단을 요청한다’와
  I의 ‘Supabase 원격 적용은 사용자 승인 없이 실행하지 않는다’.
