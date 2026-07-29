# PG Production 활성화 체크리스트

현재 상태: 비활성 — PHASE 10G Draft PR만 허용

- [ ] 사용자에게 PHASE 10G PR merge 승인 받기
- [ ] 사용자에게 Production migration 승인 받기
- [ ] PortOne 계약·상점 심사·국내 PG 채널 심사 완료
- [ ] 환불·취소·현금영수증·세금계산서 정책 법률/세무 검토
- [ ] Production 전용 API secret과 webhook secret을 서로 분리해 발급
- [ ] Vercel Production에 sensitive secret 등록(값 출력 금지)
- [ ] client store ID/channel key의 Production 범위 확인
- [ ] callback allowlist와 공식 도메인 HTTPS 확인
- [ ] PortOne webhook `2024-04-25`, Production 모드, 정확한 endpoint 등록
- [ ] webhook secret rotation 절차 검증
- [ ] 최소 금액의 승인된 실제 결제·전체 환불 수동 E2E 계획 승인
- [ ] 금액·통화 변조, callback 위조, signature 실패, replay, 중복 성공 재검증
- [ ] 관리자 권한·RLS·noindex·no-store 재검증
- [ ] 로그/오류에 credential·결제수단·개인정보가 없는지 확인
- [ ] rollback: feature disable, provider 미선택, manual fallback 절차 확인
- [ ] Production 배포 후 첫 24시간 webhook 실패·중복·환불 모니터링 담당자 지정

하나라도 미완료면 Production 결제를 활성화하지 않는다.
