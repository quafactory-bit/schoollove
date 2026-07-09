# SchoolLoveI v1.0 Design Package

## 상태

**FROZEN**

이 문서는 스쿨러브아이 v1.0 Design Package의 문서 목록과 역할을 정리한 중심 목차입니다.

새로운 철학이나 기능은 추가하지 않습니다.  
변경이 필요한 경우 GPT 프로젝트에서 논의한 뒤, 관련 문서를 업데이트합니다.

---

## 핵심 원칙

스쿨러브아이는 학교를 검색하는 서비스가 아니라 **사람을 발견하는 서비스**입니다.

판단 기준:

- 학교보다 사람
- 페이지보다 필터
- 등록보다 발견
- 입력보다 기여
- 레벨보다 성장

---

## 문서 목록

| 번호 | 문서 | 역할 | 파일 |
|---|---|---|---|
| 00 | Product Constitution | 제품 헌법, 최상위 방향과 금지선 | `00-product-constitution.md` |
| 01 | Diagnosis | 현재 코드/DB 진단, 리팩토링 근거 | `01-diagnosis.md` |
| 02 | Product Principles | 다섯 원칙 선언문 | `02-product-principles.md` |
| 03 | Level Policy | 레벨·완성도·임박·State 기준 | `03-level-policy.md` |
| 04 | Home Feed | 성장 순간 피드 | `04-home-feed.md` |
| 05 | School Hub | 학교 페이지 4상태 | `05-school-hub.md` |
| 06 | People Discovery | Year·Class·Profile, 사람 발견 여정 | `06-people-discovery.md` |
| 07 | Register Flow | 등록은 입력이 아니라 기여 | `07-register-flow.md` |
| 08 | Search | 검색이 아니라 발견의 진입점 | `08-search.md` |
| 09 | Admin | 제품 신뢰 유지 시스템 | `09-admin.md` |
| 10 | SEO | 외부 유입을 사람 발견으로 연결 | `10-seo.md` |
| 11 | User Journey | Discovery Loop + Growth Loop | `11-user-journey.md` |
| 12 | DB Schema | 최소 데이터 구조 계약 | `12-db-schema.md` |
| 13 | API | 화면과 DB를 잇는 인터페이스 계약 | `13-api.md` |
| 14 | Open Issues | v1.0 이후로 미룬 결정 보관소 | `14-open-issues.md` |

---

## 읽는 순서

### 서비스를 빠르게 이해할 때

1. `02-product-principles.md`
2. `11-user-journey.md`
3. `00-product-constitution.md`

### 개발을 시작할 때

1. `README.md`
2. `02-product-principles.md`
3. `11-user-journey.md`
4. `12-db-schema.md`
5. `13-api.md`
6. 구현할 화면 PRD
7. `14-open-issues.md`

---

## 구현 범위 요약

v1.0은 새 프로젝트가 아닙니다.  
기존 `schoollove` 저장소를 리팩토링합니다.

### P1에서 구현

- DB 컬럼 3개 추가
  - `schools.current_level`
  - `schools.level_updated_at`
  - `search_logs.clicked_school_id`
- Home Feed 리팩토링
- School Hub 4상태
- Year/Class/Profile 사람 발견 구조
- Register Flow Success Component
- Search
- Admin
- SEO
- API 계층 정리

### P1에서 하지 않음

- 새 프로젝트 생성
- 로그인/회원가입 추가
- SNS 기능 추가
- 개인 프로필 페이지 강화
- P2/Future 기능 구현

---

## 와이어프레임

최신 와이어프레임은 아래 폴더에 보관합니다.

```text
wireframes/
