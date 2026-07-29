# 결제·환불 운영 Runbook

## 결제 확인

1. 관리자 `/admin/payments`에서 주문번호, provider, 금액, 상태만 확인한다.
2. `paid`는 provider 재조회와 서버 금액 일치가 완료된 상태다.
3. callback 화면이나 고객 캡처만으로 상태를 수동 변경하지 않는다.
4. 실패 webhook은 safe error code와 시도 횟수만 확인하고 원문 개인정보를 로그에 복사하지 않는다.
5. 재처리는 동일 event ID와 결제 ID를 유지한다.

## 환불

1. 주문의 결제 상태와 누적 환불액을 확인한다.
2. 환불 예정액이 잔여 결제액을 초과하면 중단한다.
3. sandbox provider 결과가 확인된 뒤에만 `payment_refund_attempts`와 주문 누적 환불액을 원자적으로 기록한다.
4. 부분 환불은 `partially_refunded`, 전액 환불은 `refunded`여야 한다.
5. 실패 시 동일 idempotency key로 결과를 먼저 조회하고 임의로 새 키를 만들어 반복 요청하지 않는다.
6. Production 환불은 별도 활성화 승인 전 실행하지 않는다.

## 장애

- signature 실패 증가: webhook secret·raw body 전달·시각 오차를 점검하고 결제를 완료 처리하지 않는다.
- 금액/통화 불일치: 즉시 중단하고 주문·provider 내역을 대조한다.
- 중복 event: 정상 멱등 응답으로 처리한다.
- provider 장애: 수동 결제로 자동 전환하지 말고 결제 버튼을 비활성화한 뒤 영향도를 보고한다.
