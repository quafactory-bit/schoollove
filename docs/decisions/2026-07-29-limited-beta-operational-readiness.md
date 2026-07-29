# PHASE 10F — 제한 베타 운영 준비 결정

## 결정

개인 기능은 공개 출시하지 않는다. 이메일 OTP 세션, KST 만 19세 이상 자기진술, 필수 동의, 해시 기반 초대, 운영자 승인까지 모두 충족한 사용자에게만 제한 베타 기능을 연다.

기능별 접근 키는 `account_registration`, `private_profile`, `people_search`, `connection_request`, `messaging`, `instagram_permission`, `promotion_application`, `promotion_operations`로 고정한다. 프로그램·사용자 override와 전체 비상 차단을 지원하며, 불명확한 상태는 접근 거부로 처리한다.

## 개인정보 경계

- 초대 제한에는 이메일·도메인의 SHA-256 hash만 저장하고 원문을 저장하지 않는다.
- 기존 공개 프로필 25건의 소유권을 임의 부여하거나 내용을 수정하지 않는다.
- 재학 중 기수의 유입을 막기 위해 KST 현재 연도보다 미래인 졸업연도를 API와 DB trigger 양쪽에서 거부한다.
- 사용자 내보내기는 본인 소유 정보만 제공하고 상대 user ID와 상대 비공개 프로필은 제외한다.
- CSV는 수식 실행 문자를 중화한다.

## 운영 결정

- maintenance는 advisory transaction lock과 고유 `run_key`로 중복 실행을 막는다.
- 보존 기간은 코드 상수가 아니라 활성 `retention_policy_versions.rules`에서 읽는다.
- Vercel Hobby 제약에 맞춰 cron은 하루 한 번 `18:00 UTC`에 요청한다. 실제 호출 시각은 해당 시간대 안에서 지연될 수 있으므로 정확 시각 업무에는 사용하지 않는다.
- `CRON_SECRET`이 없거나 일치하지 않으면 cron endpoint는 401로 닫힌다.
- 알림 공급자가 없는 상태에서는 outbox를 외부로 발송하지 않는다.
- 관리 화면과 health endpoint는 기존 관리자 세션을 요구하고 개인 원문을 표시하지 않는다.

## 배포 경계

PHASE 10F migration, merge, Production 배포는 이번 연속 작업 승인 범위 안에서만 수행한다. PHASE 10G는 별도 브랜치의 로컬 검증·Draft PR까지만 허용하고 Production 적용은 금지한다.
