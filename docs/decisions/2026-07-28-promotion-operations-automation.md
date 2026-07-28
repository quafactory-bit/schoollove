# PHASE 10E — 프로모션 반복 운영 자동화

- 상태: **APPROVED / LOCAL IMPLEMENTATION**
- 승인일: 2026-07-28
- Production 적용: **금지 (Draft PR까지만)**

## 목표와 경계

PHASE 10D의 수동 검수·수동 결제 광고 MVP를 반복 운영 가능한 상품, 견적, 주문, 결제 확인, 일정, 취소·환불, 알림, 집계 보고 구조로 확장한다. 실제 PG, 카드·계좌 정보, 자동 환불, 실사용자 테스트는 포함하지 않는다. 모든 금액은 관리자 설정 상품과 발행 시점 snapshot에서만 결정하며 애플리케이션에 가격을 하드코딩하지 않는다.

## 상품과 가격 snapshot

관리자는 placement, 기간, 이미지 규격, 문구 제한, 기본 가격, VAT 표시, 학교·지역 타기팅 허용 여부, 판매 상태와 정책 version을 갖는 상품을 관리한다. 견적은 발행 당시 상품과 가격 정책을 JSON snapshot과 금액 컬럼으로 보존한다. 이후 상품이 바뀌어도 기존 견적과 주문 가격은 변하지 않는다.

## 견적·주문·수동 결제

승인된 광고 신청에만 만료 시각이 있는 견적을 발행한다. 광고주는 본인 견적만 수락하거나 거절할 수 있고, 수락은 단 하나의 주문과 append-only 상태 이력을 원자적으로 생성한다. 기본 `PaymentProvider`는 `manual`이며 실제 계좌번호나 금융정보는 저장하지 않는다. 광고주의 입금 완료 표시는 금액과 idempotency key만 받고, 관리자는 정확·부족·부분·초과 상태를 기록한다. 정확 또는 초과 확인 전에는 예약할 수 없다.

## 취소·환불

광고주는 본인 주문에 취소를 요청한다. 관리자는 승인·거절, 환불 예정 금액과 사유를 결정하고 실제 외부 환불 이후에만 부분·완료·불가 상태를 확인한다. 자동 환불은 없다. 주문 상태, 환불, 감사, 알림 outbox는 한 RPC transaction에서 함께 기록한다.

## 운영 캘린더와 보고

운영 캘린더는 KST 날짜, placement, 학교·지역 문맥, 예약·활성·중단·취소·종료 상태만 관리자에게 제공한다. 기존 활성 slot unique constraint를 유지한다. 성과 보고는 노출·클릭을 날짜·placement·학교·지역 문맥으로 집계하고 raw metric row, 사용자 ID, 이메일, 검색·연결·메시지 이력을 반환하지 않는다. CSV는 인증 후 서버에서 생성하고 spreadsheet formula injection을 무력화한다.

## 보안·배포 경계

- 모든 신규 private table에 RLS와 FORCE RLS를 적용한다.
- 공개·anon·authenticated의 직접 table mutation과 RPC 실행을 차단하고 service-role API 경계만 사용한다.
- owner user ID는 request body가 아니라 검증된 session에서만 가져온다.
- 관리자 상태 전이는 인증된 관리자 route와 service-role RPC로만 수행한다.
- private 화면은 noindex, nofollow, nocache, noarchive이며 sitemap에 포함하지 않는다.
- PHASE 10A~10D의 개인정보·성인·소유권·연결·광고 안전 경계를 유지한다.
- PHASE 10E migration merge와 Production 적용은 별도 승인 전까지 금지한다.
