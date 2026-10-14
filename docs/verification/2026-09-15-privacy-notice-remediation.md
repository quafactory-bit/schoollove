# 개인정보 고지 보완 검증

## 상태

이 절 아래는 최초 고지 초안의 검증 이력이다. 2026-09-16 추가 승인 후 삭제 자동화와 고지 배포를
진행했으며 최신 상태는 [후속 배포 검증](2026-09-16-privacy-retention-release.md)을 따른다.

화면/고지 코드는 `LOCAL_VERIFIED`. 국외 이전 전체 내역과 일부 잔존정보 보유기한은 미확정이므로
**전체 1·2·3 조치 완료, 법률 검토 완료, 배포 가능 상태가 아니다.**
사용자가 확인한 보호책임자와 최종 업무용 전화번호를 반영했다.

## 변경 파일

- `app/account/AccountClient.tsx`: 필수 동의 직전 공통 고지와 선택 정보 안내.
- `components/privacy/CollectionNotice.tsx`, `lib/privacyNotice.ts`: 필수/선택 수집 항목·목적·보유기간·거부 효과.
- `app/privacy/page.tsx`: 항목별 고지, 인증·복구 처리, 자동 수집, 공급자별 국외 이전 개정안, 보호책임자, 권리행사·안전성·변경 안내.
- `app/login/page.tsx`, `lib/auth/social-broker/preview-recovery-http.ts`: 로그인/이메일 입력 전 처리 내용과 해당 방침 링크.
- `scripts/growth-ux/fixture.jsx`: 기존 합성 UI 검토 서버에 `/privacy` 화면 연결. 실제 애플리케이션 route를 추가한 것이 아니다.
- 해당 Decision, FROZEN addendum, CHANGELOG, IMPLEMENTATION_LOG 및 본 검증 문서.

## 보존한 기존 변경과 파일

시작 시 수정되어 있던 `AGENTS.md`, Home shimmer 검증 기록, SNS 로고 Decision/SNS 운영 기록은 수정하지 않았다.
`docs/IMPLEMENTATION_LOG.md`는 기존 내용을 유지한 채 이번 작업 기록만 추가한다.
DB·migration·API 권한·동의 저장 함수·정책 authority·선택 입력 조건·package/lockfile·환경 파일은 변경하지 않았다.
과거 동의를 새 고지 동의로 재작성하지 않았다. 실제 재동의 강제나 법적 소급 보완은 구현하지 않았다.

## 실행한 검증

| 명령/확인 | 실제 결과 |
| --- | --- |
| `git status --short --branch` | 시작 시 기존 변경 식별 및 보존 |
| `npm test -- app/legalSafety.test.ts app/account/page.test.ts app/login/page.test.ts lib/auth/social-broker/preview-recovery-http.test.ts` | 4개 파일, 45개 테스트 통과 |
| `npm run typecheck` | exit 0 |
| `npm test -- --maxWorkers=2` | 206개 파일/1,708개 통과, 기존 3개 파일/4개 제외 |
| `npm run build` | exit 0, 정적 페이지 67개 생성. 기존 무관한 파일의 lint 경고 유지 |
| `git diff --check` | exit 0 |
| `node scripts/growth-ux/serve.mjs` + CUA browser | 환경 파일을 읽지 않는 합성 UI를 localhost에서 확인 |

브라우저 결과:

- `/privacy`: 1280/390 너비에서 가로 넘침 없음. 필수 3개/선택 3개 수집 안내 표시.
- 보호책임자 전화 링크가 사용자 최종 업무용 번호와 일치함을 확인.
- `/account?mode=new`: 390 너비에서 고지가 네 동의 체크박스보다 먼저 위치하며 모두 기본 미선택.
- 선택 정보 안내 펼침 성공. 관찰된 브라우저 error 로그 없음.
- 실제 동의 제출·가입·이메일 발송·회원 데이터 조회/수정 없음.
- 첫 DOM 확인 스크립트의 `compareDocumentPosition`은 도구에서 지원되지 않아 실패했다.
  DOM의 선택 결과 순서로 변경해 해당 검증을 완료했다. 앱 오류가 아니다.

## 읽기 전용 운영 확인

- Supabase 프로젝트 메타데이터에서 운영 주 DB 싱가포르 확인.
- Vercel 팀은 Hobby, 실제 운영 배포의 함수 지역은 미국 `iad1` 확인.
- 운영 DB는 지정한 함수 세 개의 정의만 SELECT. 개인 행이나 비밀값 조회 없음.
- Upstash 콘솔은 로그인 화면까지만 접근 가능. 인증·설정 변경 없음.
- 공식 공급자 정책을 읽고 기본 정책과 실제 계정 설정을 구별했다.

## 아직 확인하지 못한 사항

1. Upstash 추가 읽기 복제 국가 유무와 백업·로그 정책. 도쿄 지역·AWS·무료 티어는 사용자 화면으로 확인 완료.
2. Supabase 백업/로그 보유기간 및 국외 지원·재위탁의 실제 적용 범위.
3. Vercel CDN·보안 로그·Analytics의 처리 국가 및 보유기간 전체 범위.
4. 공급자별 재위탁의 실제 적용 범위. Resend Free 요금제·표준 보관기간·가입 시 DPA 적용은 확인 완료.
5. 탈퇴 후 남는 복구 해시/로그인 식별 기록/cleanup job의 필요 최소 보유기간 및 파기 실행.
6. 기존 동의와 변경된 고지의 차이에 따른 재동의·동의 기록 버전 전환 필요성.

기존 `ACCOUNT_POLICY_VERSION`은 성인 판정과 여러 DB 권한 검사에 함께 사용되므로
문구 날짜에 맞춰 단순 변경하면 기존 계정의 권한과 DB 계약을 깨뜨린다. 이번 변경은 고지 개정안이며,
필요한 재동의는 인증/동의 authority를 분리해 별도로 설계·검증해야 한다.

## 원격 변경 및 다음 단계

원격 변경 0. commit/push/배포/원격 migration/실제 가입·OTP는 실행하지 않았다.
2026-09-16 후속 사용자 승인으로 배포 승인은 확보했다. 미확정 사실을 확인해 개정안을
확정하고 시행일을 정하면 같은 승인 범위에서 배포를 진행한다. 현재는 사실 확인 대기다.
조회 가능한 로그 기간은 완전 삭제 보장이 아니고, OTP 유효기간은 메일 보유기간이 아니다.
계약 종료 후 보유기간과 개별 이용자 탈퇴 후 보유기간을 혼동하지 않는다.

## 2026-09-16 배포 승인 후 재확인

- `git status --short --branch`: 이전 로컬 초안과 기존 변경이 그대로 남아 있음을 확인.
- Supabase 연결 도구의 프로젝트→조직 조회로 운영 조직의 Free 요금제를 확인.
  [공식 가격표](https://supabase.com/pricing)의 API/DB 로그 보관은 1일이다.
  [백업 안내](https://supabase.com/docs/guides/platform/backups)의 유료 플랜 백업 기간을 Free에 대입하지 않았다.
- [Vercel Analytics 공식 안내](https://vercel.com/docs/analytics/limits-and-pricing)는
  Hobby 보고 기간 1개월보다 오래 저장될 수 있다고 명시한다. 보고 기간을 최대 파기 기한으로 쓰지 않는다.
- [Upstash 보안 조치](https://upstash.com/static/trust/security-measures.pdf)의 최대 4주 보관은
  클러스터 종료 후 백업 사본에 관한 조건이다. 개별 rate-limit 키의 TTL이나 실제 저장 국가를 증명하지 않는다.
- Upstash/Resend/Supabase 브라우저에는 운영 설정을 읽을 로그인 세션이 없었다.
  아직 필요한 실제 Upstash 저장 지역 및 Resend 요금제를 사용자에게 요청했다.
- 이번 후속에서는 Decision·본 검증 문서·IMPLEMENTATION_LOG만 갱신했다.
  앱 코드·연락처·기존 파일 변경은 유지했다. 문서 변경에 `git diff --check`를 실행했고 통과했다.
  이전 45개 대상/1,708개 전체 테스트·typecheck·build 결과를 보존하며 새 실행으로 표시하지 않는다.
- 배포·commit/push/merge·실제 가입/OTP·원격 DB mutation은 여전히 실행하지 않았다.
  배포 승인을 다시 받을 필요는 없으며, 남은 작업은 실제 운영 정보와 재동의/파기 경계 확인이다.

## 모바일 설정 화면 반영

- 사용자가 직접 보낸 Resend Billing에서 Transactional 3,000 emails / $0를 확인해 Free 요금제를 확정했다.
  [공식 GDPR 안내](https://resend.com/security/gdpr)에 따른 이메일·로그 30일/백업 7일을 고지에 반영했다.
  해당 안내는 가입 시 모든 Resend 계정에 DPA가 적용된다고 명시한다.
- Upstash 상세 화면과 상단 확대 화면에서 AWS, Free Tier, Tokyo/Japan, `ap-northeast-1`, Global을 확인했다.
  고지에 일본 도쿄와 무료 티어를 반영했다. [Global DB 문서](https://upstash.com/docs/redis/features/globaldatabase)는
  읽기 지역이 없는 단일 주 지역도 허용하므로 Global 표시만으로 여러 나라에 복제된다고 판단하지 않았다.
  상단 사진은 별도 Read Regions 설정 목록이 아니므로 추가 복제 유무는 미확정으로 유지한다.
- 앞서 제공된 긴 Upstash 사진은 글자가 너무 작아 지역을 확정하지 않았으며, 뒤이어 받은 확대 사진을 근거로 사용했다.
- 원본 사진은 Git이나 공개 페이지로 복사하지 않았다. 요금제·국가·지역 등 필요한 운영 정보만 기록했다.
- 후속 변경은 `app/privacy/page.tsx`, `lib/auth/social-broker/durable-code.test.ts`, Decision, CHANGELOG, IMPLEMENTATION_LOG 및 본 보고서다.
  기존 다른 앱 코드·SNS/Home 기록·DB·패키지·환경 파일은 보존했다.
- 대상 테스트 4개 파일/45개 및 typecheck 통과. 첫 전체 검사에서 205개 파일/1,707개 테스트 통과,
  기존 3개 파일/4개 제외, `durable-code.test.ts:45`의 변조 검사 1개가 실패했다.
  해당 검사는 무작위 암호문의 마지막 바이트를 0으로 대체해 원래 0이면 실제 변조가 없었다.
  마지막 바이트의 한 비트를 XOR로 반전하도록 보완했으며 기존 오류 거부 assertion을 유지했다.
  인증/암호화 runtime은 수정하지 않았다. 수정 후 대상 2개 파일/8개 테스트와 typecheck 통과.
  `npm test -- --maxWorkers=2` 재검사는 206개 파일/1,708개 테스트 통과, 기존 3개 파일/4개 제외(exit 0).
  `npm run build`는 exit 0, 정적 페이지 67개 생성으로 통과했다. 기존 무관한 파일의 lint 경고는 유지했다.
  빌드는 프로세스 범위의 로컬 Supabase 더미 주소/키 및 비활성 메일·요청 제한 설정을 사용했으며 환경 파일을 수정하지 않았다.
  최종 `git diff --check` 통과. 이번 문구 후속에서는 브라우저 재검증·실제 가입·OTP·운영 쓰기를 실행하지 않았다.
- 아직 공급자별 전체 보관/이전 범위 및 탈퇴 잔존 기록·재동의 경계가 남아 있으므로 전체 개정안 배포는 하지 않았다.

## 2026-09-16 남은 근거 검토·삭제 기준 제안 완료

- 산출물: [보관 근거와 삭제 기준 제안서](../proposals/2026-09-16-privacy-retention-and-deletion.md).
  공급자별 공식 출처, 운영 코드의 공백, 권장 기준, 구현·검증 조건, 공급자 문의 3개 초안을 포함한다.
- 읽기 전용 운영 확인: `revoke_social_identity_for_deletion`,
  `admin_finalize_public_account_auth_deletion`, `admin_purge_expired_public_account_deletion_audit`
  함수 정의와 관련 스키마 메타데이터를 조회했다. pg_cron 미설치, 다른 public/private 함수에서
  해당 purge 이름의 호출 참조 0개를 확인했다. 실제 이용자 행·잔존량은 조회하지 않았다.
- 로컬 `rg`와 파일 읽기로 일일 operations 작업이 phase10f/10h maintenance만 호출하는 점,
  HMAC·subject·완료 작업 UUID의 잔존 경로와 FK 제약을 확인했다. 저장소 밖 실행기는 미확인이다.
- 일부 초기 Windows glob 경로 검색은 실패했고 정확한 경로/`rg -g`로 재확인했다.
  이를 성공한 검증으로 계산하지 않는다.
- Vercel 최신 DPA의 Pro·Enterprise 범위, Hobby 조회 기간과 실제 보유기간의 차이,
  Supabase Free 일시중지 복구 창, Upstash 무료 DB 보관 조건을 공식 자료와 대조했다.
  적용 계약·내부 로그·백업 최대 기간의 미확정 사항은 제안서에 명시했다.
- 이번 변경 파일: 제안서, 본 검증 기록, 개인정보 Decision, IMPLEMENTATION_LOG.
  기존 앱 초안·암호문 테스트 보완·SNS/Home 변경·DB migration·패키지·환경 파일은 수정하지 않았다.
- `git diff --check`와 제안서의 저장소 파일·문서 링크 경로 확인을 완료했다.
  이번에는 문서만 수정하여 npm 대상/전체 테스트·typecheck·build·브라우저 검사를 재실행하지 않았다.
  앞선 1,708개 전체 테스트와 build 통과는 앞선 코드 버전의 실행 기록으로 유지한다.
- 원격 변경, 실제 삭제, 문의 발송, 계약·요금제 변경, commit/push/merge/배포 없음.
  기존 고지 배포 승인은 유효하다. 새 삭제·재가입 정책은 제안 상태이며 실제 원격 DB 적용은 별도 범위다.
