# SchoolLoveI Open Issues v1.0

Status: **FROZEN PACKAGE OPEN-ISSUE REGISTER**

## 0. 규칙

새로운 철학이나 기능 아이디어를 기존 FROZEN PRD에 즉시 섞지 않는다.

아직 확정되지 않은 항목은 이 문서에서 관리한다.

v1.0 P1 구현을 막는 Blocker와 P2/Future를 구분한다.

---

## 1. P1 Blocker

**현재 확정된 P1 Blocker 없음.**

v1.0 구현은 시작할 수 있다.

---

## 2. Level Policy Open

### XP Source 최종 확정

상태: **DEFERRED — 의도된 보류**

현재 LevelState/API/UI 계약은 고정한다.

v1.0 잠정 Source는 등록 기본 행동을 사용하지만, 향후 Event-based Value Model로 교체한다.

검토 대상:

- 등록 가치
- trace 가치
- 기수/반 다양성 가치
- 발견/재방문 가치

이 변경은 LevelState 계약을 깨지 않아야 한다.

---

## 3. School Hub Open

### State D Freshness

대표학교 조건에 최근 활동 freshness를 추가할지 P2에서 검토한다.

현재 v1.0은 Level + Completion 대표 조건을 사용한다.

### 대표학교 활동 유지 조건

장기간 활동이 없는 대표학교 배지 유지 정책은 P2.

---

## 4. People Discovery Open

- 흔적 주제 키워드 추출 방식 — P2
- 대형 기수 서버 검색 전환 임계값 — P2
- Year Hub 전체 명단 정렬 최종 기준
- Instagram add 스팸/악용 고도화

P1 기본 구조는 구현 가능하다.

---

## 5. Search Open

- 인기 검색 학교 — P2
- 개인 이름 글로벌 검색 확장 — Future
- 검색 추천/자동완성 고도화 — P2

P1은 학교 Search + 실제 학교 클릭 로그까지다.

---

## 6. SEO Open

- Schema.org 확장
- OG Image 자동 생성
- 지역 Hub
- 추가 구조화 데이터
- 대형 학교 query/caching 고도화

모두 P2/Future.

---

## 7. Sharing / Platform Open

- Kakao share
- PWA
- 앱 전환

v1.0 P1 범위 아님.

---

## 8. Home Feed Open

- 고급 dedup/collapse 정책
- 대형 Feed 캐싱 전략
- event-based feed storage 별도 테이블 필요 여부

P1은 기존 이벤트 원천 조합으로 구현한다.

---

## 9. Owner Map

| 주제 | Owner Document |
|---|---|
| Product Definition | 00 Product Constitution |
| Product Principles | 02 Product Principles |
| Level / Growth State | 03 Level Policy |
| Home Growth Feed | 04 Home Feed |
| School State / CTA | 05 School Hub |
| Year / Class / Profile Card | 06 People Discovery |
| Registration | 07 Register Flow |
| Search | 08 Search |
| Trust / Reports | 09 Admin |
| Index / Canonical / Sitemap | 10 SEO |
| Journey | 11 User Journey |
| Tables / Columns | 12 DB Schema |
| API Contract / Security | 13 API |

---

## 10. Frozen Rule

- P1 구현 중 새로운 제품 결정이 필요하면 구현을 멈춘다.
- Owner Document에서 답을 먼저 찾는다.
- 문서에 없으면 GPT 프로젝트에서 결정한다.
- 승인된 결정은 `docs/decisions/`에 이유를 기록한다.
- 제품 변경은 `CHANGELOG` 대상인지 구분한다.
- 실제 구현 완료는 `IMPLEMENTATION_LOG`에 기록한다.
