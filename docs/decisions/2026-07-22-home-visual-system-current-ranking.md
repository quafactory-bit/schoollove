# Home Visual System and Current Ranking

Date: 2026-07-22

## Decision

1. 사용자가 승인한 첨부 디자인 시안을 Home의 시각 기준으로 적용한다. 따뜻한 아이보리 배경, 저채도 의미 색상, 본문/상태 글꼴 분리, 얇은 구분선 피드를 공통 토큰으로 구현한다.
2. Home 순위는 최근 7일 성장량이 아니라 전체 기간의 공개 프로필 누적 수 기준 TOP 3인 “현재 학교 순위”로 표시한다.
3. 정렬과 제외 조건은 기존 `school_growth_ranking_v1`을 전체 기간으로 호출해 재사용한다. `is_hidden=false`, 0명 학교 제외, 공개 프로필 수 내림차순, 최근 공개 등록 시각 내림차순, 학교명 오름차순 계약을 유지한다.
4. 공개 진행 바와 남은 인원은 기존 사람 수 성장 단계 helper 결과만 사용한다. Level XP 곡선과 혼합하거나 UI에서 계산식을 복제하지 않는다.
5. Level Up 이력과 과거 순위 이력이 없으므로 Level Up 피드와 순위 증감은 만들지 않는다. Home 활동 집계 API가 없으므로 가짜 LIVE 요약 숫자도 만들지 않는다.
6. Home은 개인 nickname/Instagram을 조회하거나 표시하지 않으며, 공개 등록과 공개 흔적만 익명 피드로 유지한다.

## Impact

- FROZEN Home의 활동 피드 목적과 Home/Search 2축은 유지한다.
- `app/page.tsx`, 홈 전용 컴포넌트, 공통 CSS/Tailwind 토큰, 읽기 전용 현재 순위 서버 래퍼가 변경된다.
- DB migration, Level 정책, Register Flow, School Hub, 원격 설정은 변경하지 않는다.

## Status

APPROVED BY USER REQUEST
