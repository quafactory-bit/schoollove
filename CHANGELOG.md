# Changelog

## 2026-07-29 — PHASE 10H (LOCAL/DRAFT)

- 성인 확인·필수 동의·해시 초대·운영자 승인·비공개 프로필·과거 학교 이력을 연결하는 `/onboarding` 제한 출시 흐름을 추가했다.
- 본인만 읽는 온보딩 진행 상태, 단계별 최초 진입 이벤트, 개인 원문 없는 일별 성장 집계를 추가했다.
- direct·organic social·creator·community·referral·paid social·unknown의 거친 출처만 허용하고 raw UTM·IP·referrer·검색어·이름·Instagram을 저장하지 않는다.
- 관리자 운영 화면에 현재 단계와 최근 14일 집계만 추가하고 기존 관리자 인증 경계를 유지했다.
- PHASE 10H migration은 Production에 적용하지 않고 Draft PR까지만 진행한다.

## 2026-07-29 — PHASE 10G (PRODUCTION)

- PR #30을 squash merge하고 merge commit `e76a3f67bce067bf55329ffbbeb14cf37b8816f4`를 Vercel Production에 배포했다.
- PHASE 10E schema 원문과 Production의 272개 정규화 객체 정의가 일치함을 확인한 뒤 누락된 migration history만 공식 repair로 복구했다.
- PHASE 10G migration을 Production에 적용하고 신규 결제 테이블 4개, 함수 9개, RLS/FORCE RLS와 service-role 권한을 검증했다.
- 기존 공개 프로필 25건과 private/connection/promotion/order 집계는 변경되지 않았고 신규 결제 테이블은 0건이다.
- PortOne webhook은 `PAYMENT_PROVIDER_NOT_CONFIGURED` 503이며 live payment·Production secret·실제 결제·환불·광고 주문은 활성화하지 않았다.

## 2026-07-29 — PHASE 10G (LOCAL/DRAFT)

- provider-neutral `PaymentProvider`를 create/get/verify/cancel/refund/webhook/receipt contract로 확장했다.
- manual fallback, local mock, PortOne V2 sandbox adapter를 추가했다.
- 결제·webhook replay·부분 환불·증빙 요청 schema와 service-only 원자 RPC를 추가했다.
- owner 결제 API/화면과 admin 결제·webhook·환불 운영 화면을 추가했다.
- Production credential, Production webhook, 실제 결제, migration 적용은 수행하지 않았다.
