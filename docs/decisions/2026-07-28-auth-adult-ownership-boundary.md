# Auth, Adult Eligibility, and Profile Ownership Boundary

Date: 2026-07-28
Status: **APPROVED / PHASE 10B LOCAL IMPLEMENTATION**

## 결정

- 일반 이용자 인증은 Supabase Auth 이메일 OTP로 시작한다. 기존 관리자 HMAC 세션은 별도 경계로 유지한다.
- 개인 기능은 KST 기준 만 19세 이상인 이용자에게만 허용한다. 생년월일은 서버에서 판정할 때만 사용하고 DB에 저장하지 않는다.
- 자기진술 방식은 강한 법적 본인확인이 아니며, 휴대전화·신분 확인은 후속 단계다.
- 이용약관, 개인정보 수집·이용, 만 19세 이상 확인, 기본 비공개 확인은 각각 append-only 동의 기록으로 남긴다.
- 기존 `profiles` 행은 자동 소유권을 부여하지 않고 `quarantined`/`unclaimed` 경계에 둔다.
- 신규 본인 프로필은 `private_profiles`에 분리하며 인증 사용자 한 명당 활성 프로필 하나만 허용한다.
- 이름, 학교 이력, 졸업연도, 반, Instagram, 사진, 소개는 기본 비공개다. 다른 인증 사용자도 raw row를 읽을 수 없다.
- 개인 프로필과 학교 이력 API는 request body의 user ID를 신뢰하지 않고 검증된 Supabase session user ID만 사용한다.
- 사람 검색, 메시지, 상대 승인, Instagram 개별 공개, 기존 row claim 출시는 PHASE 10C 이후로 미룬다.

## 데이터 최소화

- 원본 생년월일을 테이블·로그·응답에 저장하거나 출력하지 않는다.
- 인증 이메일은 Supabase Auth가 관리하며 public schema에 복제하지 않는다.
- 필수 동의는 정책 버전과 동의 시각만 저장한다.
- 향후 promotion용 Instagram 계정은 일반 private profile 필드와 분리된 모델로 설계한다.

## 기존 데이터

- 기존 `profiles` 행을 삭제하거나 임의 사용자에게 연결하지 않는다.
- 기존 행은 migration 적용 시 owner·ownership·visibility를 재기록하지 않는다. 새 컬럼은 `NULL`로 남고, 이후 별도 검토 흐름에서만 상태를 부여한다. 기본값 `quarantined`/`private`는 향후 쓰기에만 적용한다.
- `unclaimed`, `claimed_pending_review`, `claimed`, `deletion_requested` 상태는 관리자 검토 흐름을 위한 기반만 마련한다.
- 이름·학교를 안다는 이유만으로 claim할 수 있는 공개 API나 UI를 만들지 않는다.

## Production 경계

PHASE 10B-R 감사와 PR merge가 통과한 뒤 승인된 운영 절차에서 migration과 애플리케이션을 Production에 적용한다. PHASE 10A의 공개 차단은 적용 전후 모두 유지한다.

## 배포 및 롤백 경계

- migration은 단일 트랜잭션으로 적용하고 migration history를 기록한다.
- 애플리케이션 장애 시 먼저 PHASE 10A 안전 애플리케이션으로 되돌린다. 공개 profiles 권한은 다시 열지 않는다.
- DB 롤백이 필요하면 신규 함수의 EXECUTE와 authenticated 신규 테이블 grant를 먼저 회수한다. 신규 테이블이나 기록을 자동 삭제하지 않고 보존한 채 별도 승인 후 처리한다.
- 기존 profiles row를 되돌리기 위해 UPDATE·DELETE하는 롤백은 사용하지 않는다.

## 법률 검토

이 결정은 구현 안전 경계를 설명하는 운영 문서이며 최종 법률 검토나 법정대리인·본인확인 요건에 대한 법률 자문을 대체하지 않는다.
