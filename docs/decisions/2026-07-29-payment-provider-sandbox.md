# PHASE 10G 결제 Provider 샌드박스 결정

작성일: 2026-07-29
상태: LOCAL/DRAFT — Production 적용 금지

## 결정

`PaymentProvider`의 국내 샌드박스 adapter는 PortOne V2를 사용한다. PortOne은 토스페이먼츠, KG이니시스, NHN KCP, 나이스정보통신 등 국내 PG 채널을 하나의 V2 결제 경계로 연결하고, 결제 단건 조회·전체/부분 취소·테스트 채널·Standard Webhooks 서명을 제공한다.

이번 단계는 provider contract, PortOne sandbox adapter, 로컬 mock provider, DB 원자성, callback/webhook 검증, 운영 화면까지만 준비한다. Production API secret·webhook secret·상점/채널 설정은 등록하지 않으며 실제 결제도 실행하지 않는다.

## 공식 근거

- [PortOne V2 시작 및 지원 PG](https://developers.portone.io/opi/ko/integration/start/v2/readme)
- [PortOne V2 결제 조회·취소 API](https://developers.portone.io/api/rest-v2/payment?v=v2)
- [PortOne V2 webhook 및 Standard Webhooks 검증](https://developers.portone.io/opi/ko/integration/webhook/readme-v2?v=v2)
- [Standard Webhooks 서명 명세](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)

## 불변 조건

- 결제 금액·통화·주문 소유권은 서버 저장값으로만 결정한다.
- browser callback은 결제 완료 근거가 아니다. 서명된 callback state와 provider 단건 재조회가 모두 통과해야 한다.
- webhook은 raw body, timestamp, `webhook-id`, `webhook-signature`를 먼저 검증한다.
- `Transaction.*` allowlist 외 이벤트는 성공 응답 후 무시한다.
- `provider + event_id` unique와 결제 RPC 멱등성으로 replay·중복 성공을 차단한다.
- 카드번호, 계좌번호, 구매자 전화·이메일, webhook 원문은 저장하지 않는다.
- 결제와 주문의 `payment_confirmed` 변경은 하나의 DB transaction에서 실행한다.
- manual provider는 fallback으로 유지한다.
- mock provider는 Production에서 선택할 수 없다.
- `live_*` 또는 live로 식별되는 credential은 sandbox adapter가 거부한다.

## Production 전환 조건

`docs/operations/PG_PRODUCTION_ACTIVATION_CHECKLIST.md`를 전부 충족하고 별도 사용자 승인을 받은 이후에만 migration, 키 등록, webhook 등록, merge, Production 배포를 진행한다.
