# 결제 개인정보 처리방침 보완 초안

상태: 법률 검토 전 초안

## 처리하는 최소 정보

- 내부 주문 ID와 주문번호
- 결제 provider와 provider 결제 ID/거래 reference
- 금액, 통화, 결제·취소·환불 상태와 시각
- 영수증 reference
- 현금영수증·세금계산서 요청 여부와 식별값의 SHA-256 hash
- webhook event ID, event type, payload hash, 처리 결과

## 처리하지 않는 정보

- 카드번호·유효기간·CVC
- 계좌번호·예금주
- provider webhook 원문
- 결제 목적에 불필요한 이메일·전화번호
- 개인별 광고 방문·클릭 목록

결제수단 인증은 provider 화면에서 처리한다. 스쿨러브아이 서버는 provider의 결제 결과를 재조회해 금액·통화·상태만 검증한다. webhook metadata는 정책 version에 따른 기간 동안 보존하고 원문은 저장하지 않는다.
