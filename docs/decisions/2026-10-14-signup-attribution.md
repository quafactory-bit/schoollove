# 가입 유입 채널 측정

## 후속 승인 — 일별 합계만 저장

사용자는 개별 가입 행을 날짜·source·medium·campaign·content별 count로 대체하고 Preview에 재적용하도록 승인했다. id와 landing_path는 제거한다. 기존 적용 migration은 보존하고 새 migration으로 기존 행을 합산 전환한다. NULL 코드도 같은 조합으로 묶으며 원자적 UPSERT로 count를 증가시킨다. 브라우저와 서버 payload에서도 방문 경로를 제거하되 유효한 이전 첫 접촉의 코드는 유지한다.

기존 계정의 최초 프로필 milestone은 권한·중복 방지에만 계속 사용하며 통계와 연결하는 ID·해시·외래키는 만들지 않는다. 계정 탈퇴는 계정 경계를 삭제하고 날짜별 합계는 유지한다. 프로필만 삭제·재생성하면 재집계하지 않는다.

승인한 방침 문구를 반영한다. localStorage에 자동 만료 기능이 없으므로 7일 경과 값은 다음 접근 시 삭제·갱신한다는 동작을 함께 설명한다. Production 적용·merge는 금지한다. preview.schoollove.kr 도메인·환경 설정 변경은 방법과 영향 보고 후 별도 승인 전까지 실행하지 않는다.

## 후속 승인 — 실제 가입 테스트용 Preview 통합

사용자는 원자적 UPSERT와 빈 DB의 081007→090650 적용 검증을 먼저 요구했다. preview 브랜치 HEAD가 현재 도메인의 배포 commit과 같고 미배포 커밋이 없으면 기능 브랜치를 preview에 merge하는 A를 승인했다. 미배포 작업이 있으면 B의 설정 임시 이동·테스트 후 복구를 사용한다. 실제 가입과 재로그인은 사용자가 직접 진행하며 완료 후 SQL로 합계를 확인한다. Production 적용·Production/main merge·PR #131 merge는 계속 금지한다.

확인한 preview HEAD와 배포 commit은 모두 1d355e29635b89069472a2d9d44191d289e28a24다. A를 선택하므로 15개 설정·도메인 gitBranch는 이동하지 않는다. 분기 이력의 충돌은 별도 통합 작업 폴더에서 해소하고 실제 통합 결과를 테스트한 뒤 preview 브랜치에만 발행한다.

## 이전 행 단위 구현 기록 (위 결정으로 대체)

사용자의 2026-10-14 작업지시서에 따라 구현한다. 후속 지시로 방침 문구 반영, commit·push·Draft PR, Preview migration·배포를 승인받았다. Production 적용과 merge는 승인 범위에 포함하지 않는다.

- 가입은 기존 성인 확인·필수 동의를 통과한 최초 비공개 프로필 생성으로 정의한다. Google 재로그인과 프로필 수정·삭제 후 재생성은 추가 집계하지 않는다.
- 기존 eligibility의 최초 프로필 milestone을 잠근 상태에서 기존 owner RPC와 익명 attribution INSERT를 같은 transaction으로 실행한다. 익명 테이블에는 계정 식별자나 시각을 저장하지 않는다.
- 서버 service-role 전용 wrapper는 검증된 세션 ID만 받고 기존 owner RPC의 성인·동의·접근 경계를 그대로 호출한다. 브라우저 역할은 wrapper·통계 테이블에 접근할 수 없다.
- 첫 접촉은 7일간 브라우저에 보관한다. 민감한 동적 경로는 수집하지 않고 안전한 정적 경로 또는 가린 경로만 보관한다. 형식 불량/만료 payload는 unknown으로 집계한다.
- Analytics에는 형식 검사한 UTM 네 개만 남긴다. 인증·성장 API 제외 규칙은 유지한다.
- 개인정보처리방침의 '모든 검색 매개변수 제거'를 네 UTM 코드 허용으로 바꾸고 7일 first-touch 통계를 설명한다. localStorage는 자동 만료 저장소가 아니므로 '7일 이내의 값만 사용, 다음 방문 때 갱신'으로 실제 동작을 명확히 한다. 설명 개정일만 변경하며 역사적 동의 버전은 보존한다.

## 후속 승인 — 통계 장애 분리·자동 E2E·Preview 검색 차단

사용자는 수동 가입과 보호 예외를 취소하고, 통계 저장 실패로 프로필 생성이 롤백되지 않도록 변경·실패 테스트를 승인했다. 기존 owner 저장과 최초 milestone은 유지하고 통계 쓰기만 PL/pgSQL 예외 하위 transaction으로 감싼다. 실패 시 프로필은 성공하고 attribution_recorded=false를 반환한다. 이후 수정/재로그인에 뒤늦게 집계하거나 계정 연결 재시도 기록을 만들지 않는다. 따라서 통계 실패 시 누락은 가능하다.

Preview의 관리자 생성 합성 계정·실제 발급 세션과 Vercel 자동화 전용 bypass로 보호된 자동 E2E를 시도한다. 공용 로그인 provider를 바꾸지 않고 실제 Google OAuth/이메일 발송을 실행하지 않는다. 테스트 계정·격리된 코드의 합계·임시 bypass는 종료 후 정리한다. 기존 두 계정은 건드리지 않는다. 실행 불가 시 이유와 Production 승인 후 일별 대조 계획을 보고한다. Production 적용과 merge는 승인되지 않았다.

Preview만 robots Disallow:/와 전체 noindex/nofollow/noarchive header를 적용한다. production과 기본 로컬 환경의 기존 SEO 계약은 보존한다. 보호 예외는 계속 만들지 않으며 수동 테스트/1시간 개방 타이머는 취소 상태다.
