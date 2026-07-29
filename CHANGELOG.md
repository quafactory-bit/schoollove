# Changelog

## 2026-07-29 — PHASE 10G (LOCAL/DRAFT)

- provider-neutral `PaymentProvider`를 create/get/verify/cancel/refund/webhook/receipt contract로 확장했다.
- manual fallback, local mock, PortOne V2 sandbox adapter를 추가했다.
- 결제·webhook replay·부분 환불·증빙 요청 schema와 service-only 원자 RPC를 추가했다.
- owner 결제 API/화면과 admin 결제·webhook·환불 운영 화면을 추가했다.
- Production credential, Production webhook, 실제 결제, migration 적용은 수행하지 않았다.
