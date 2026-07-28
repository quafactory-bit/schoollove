# PHASE 10C — 안전한 사람 발견·안부·연결·기본 대화

- 상태: **APPROVED / LOCAL IMPLEMENTATION**
- 승인일: 2026-07-28
- Production 적용: **아직 금지**

## 결정

SchoolLoveI의 사람 발견은 공개 명단이나 부분 검색이 아니라 사용자가 기억하는 `학교 + 졸업연도 + 정확한 이름`의 일치 여부만 확인하는 비공개 흐름으로 재개한다. 검색 응답에는 사람 목록, 결과 수, 사용자 ID, Instagram, 사진, 반, 최근 접속 정보를 포함하지 않는다. 일치 대상은 짧게 만료되는 opaque match token으로만 다음 요청 단계에 전달한다.

최초 안부는 텍스트 200자 이하로 한 번만 보낼 수 있다. URL·이메일·전화번호·외부 메신저/소셜 연락처 패턴을 클라이언트, 서버, DB에서 모두 거부하고 원문을 로그에 남기지 않는다. pending 상태에서는 추가 메시지나 수정이 불가능하다. 전송 7일 뒤에도 pending이면 서버 시각과 원자적 DB 갱신으로 기존 안부 알림을 한 번만 다시 보낼 수 있다.

수신자는 수락, 아닌 사람, 거절, 차단, 신고를 선택한다. 수락은 connection 생성과 request 상태 변경을 한 트랜잭션으로 처리한다. 차단·신고·연결 해제는 이후 요청·메시지를 즉시 막고 연결별 Instagram 공개 권한을 취소한다. 수락된 연결에서만 500자 이하 텍스트 대화를 허용하며 PHASE 10C에서는 URL·이메일·전화번호·외부 연락처 공유를 계속 금지한다.

Instagram은 연결 성립과 무관하게 상대별 개별 승인 후에만 공개한다. 취소, 연결 해제, 차단 시 즉시 비공개가 된다. 이 권한은 `connection_instagram_permissions`로 명명하며 PHASE 10D의 Today Instagram 광고·결제 도메인과 분리한다.

## 보안 경계

- 인증된 세션의 사용자 ID만 신뢰하고 body의 user ID는 받지 않는다.
- 검색·요청·응답·재알림·대화·Instagram 승인은 service-role 전용 RPC/API에서 수행한다.
- 개인 테이블은 RLS와 FORCE RLS를 모두 사용하고 anon 권한을 부여하지 않는다.
- Production에서 Upstash 설정이 없으면 검색과 모든 mutation을 503으로 fail-closed 한다.
- 검색은 IP와 계정 양쪽 제한을 적용하고 반복 열거를 같은 제한 도메인으로 집계한다.
- 알림에는 이름, 학교, Instagram, 메시지 원문을 저장하지 않는다.
- 관리자 일반 목록은 원문을 반환하지 않으며 mutation과 audit insert를 같은 RPC 트랜잭션으로 묶는다.
- 모든 개인 화면은 `noindex, nofollow, nocache`이며 sitemap에 포함하지 않는다.

## 제외 범위

- 공개 명단, 부분/초성/한 글자 이름 검색
- 이미지·파일·음성·영상 메시지
- WebSocket 실시간 채팅과 입력 중 표시
- 이메일 알림 전송(안전한 별도 전송 경계가 아직 없음)
- Today Instagram 광고, 유료 노출, 결제(PHASE 10D)

## 배포 경계

이 결정의 migration과 런타임 코드는 PHASE 10C Draft PR까지만 진행한다. Production migration, PR merge, Production 배포는 별도 승인 전까지 실행하지 않는다.
