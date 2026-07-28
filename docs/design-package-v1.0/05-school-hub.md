# SchoolLoveI Refactoring PRD — School Hub v1.0

Status: **FROZEN**

> **PHASE 10A SAFETY OVERRIDE (2026-07-28):** School Hub는 학교명·지역·학교 유형 등 학교 기본 정보만 공개한다. 프로필 수·Year/Class 개인 명단·개인 Instagram·등록 및 성장 CTA는 PHASE 10B의 성인 본인 인증·소유권·승인 경계가 완성될 때까지 중단한다. 이 안전 경계는 아래 기존 성장 UX와 충돌할 때 우선한다.

## 0. 정의

School Hub는 학교 정보 페이지가 아니다.

**학교의 성장 상태를 가장 강하게 체감하는 핵심 랜딩 페이지**다.

외부 검색 유입, 내부 Search, Home Feed가 School Hub로 모인다.

School Hub 이후부터 사람 발견 필터가 시작된다.

---

## 1. School Hub의 역할

사용자가 School Hub에서 느껴야 하는 감정은 학교 상태에 따라 달라진다.

| State | 사용자 감정 | 핵심 행동 |
|---|---|---|
| A | 내가 이 학교의 첫 시작이다 | 첫 기록 |
| B | 조금만 더 하면 레벨업이다 | 등록으로 밀기 |
| C | 우리 학교가 살아 있다 | 등록 + 사람 둘러보기 |
| D | 나도 우리 학교에 흔적을 남기고 싶다 | 등록 + 기수 발견 + 공유 |

---

## 2. State 판정

기본 A/B/C는 누적 공개 프로필 수 기준이다.

| State | 조건 |
|---|---|
| A | 등록 0명 |
| B | 등록 1~10명 |
| C | 등록 11명 이상 |
| D | State C이면서 Level/Completion 대표학교 기준 충족 |

D는 독립된 다섯 번째 흐름이 아니라 **C의 상위 대표 상태**다.

세부 Level/Completion 기준은 `03-level-policy.md`가 소유한다.

---

## 3. 공통 화면 우선순위

```text
학교 이름 / 기본 컨텍스트
  ↓
현재 성장 상태
  ↓
State별 핵심 메시지
  ↓
사람 발견 진입
  ↓
등록 CTA
  ↓
보조 행동
```

학교 설명보다 **성장 상태와 사람 발견**을 먼저 보여준다.

---

# State A — 첫 시작

## A1. 조건

등록 0명.

## A2. 핵심 감정

> 내가 이 학교의 첫 시작이다.

## A3. 핵심 카피

State A의 수요 카피는 다음 구조를 사용한다.

```text
이번 주 12명이 이 학교를 찾았습니다.
당신의 첫 기록이 이 학교의 Level 1을 시작합니다.
```

`12명`은 예시 숫자이며 실제 `search_logs.clicked_school_id` 기반 검색 수요를 표시한다.

### 금지

- "등록 0명"을 전면 카피로 강조하지 않는다.
- 조회 수와 등록 수를 비교해 결핍을 자극하지 않는다.

## A4. 성장 표시

- `Lv.1 시작 대기`
- `다음 레벨까지 1명`
- 검색 수요 숫자 표시

## A5. Primary CTA

첫 기록 / 등록.

---

# State B — 성장 중 / 레벨업 임박

## B1. 조건

등록 1~10명.

## B2. 핵심 감정

> 조금만 더 하면 레벨업이다.

## B3. 성장 표시

- 현재 Level
- 다음 레벨까지 N명
- `remainingToNext <= 2`이면 임박 상태 강조

## B4. Primary CTA

등록으로 학교 성장 밀기.

사람 발견 진입도 함께 제공하지만, 학교가 지금 변화할 수 있다는 감각을 분명히 보여준다.

---

# State C — 살아 있는 학교

## C1. 조건

등록 11명 이상.

## C2. 핵심 감정

> 우리 학교가 살아 있다.

## C3. 성장 표시

- 현재 Level
- 다음 Level까지 N
- 완성도 %
- 최근 등록/활동 컨텍스트

## C4. 행동

- 사람 둘러보기
- 기수 찾기
- 등록

발견과 기여가 동시에 존재한다.

---

# State D — 대표학교

## D1. 조건

State C + Level/Completion 대표학교 조건.

## D2. 핵심 감정

> 나도 우리 학교에 흔적을 남기고 싶다.

## D3. 표시

- Level
- Completion
- 대표학교/랭킹 배지
- **최근 등록 기수**
- 시간축 기반 최근 성장 컨텍스트

대표학교 최근 활동 조건 자체는 P2 Open Issue다.

## D4. CTA 우선순위

**등록은 계속 Primary CTA다.**

```text
최근 등록 기수
  ↓
등록 Primary CTA
  ↓
내 기수 찾기 / 사람 발견
  ↓
공유 Secondary CTA
```

공유가 등록보다 앞서지 않는다.

---

## 4. Search Demand

State A의 "이번 주 N명이 이 학교를 찾았습니다"는 실제 검색 결과 클릭 수요를 사용한다.

데이터 원천:

```text
search_logs.clicked_school_id
```

검색어 입력 횟수 자체가 아니라 **검색 결과에서 실제 학교를 선택한 행동**을 수요 신호로 본다.

---

## 5. People Discovery 연결

School Hub의 목적지는 사람 발견이다.

- 학교 전체 사람 맥락
- 기수 선택
- Year Hub
- Class Hub
- Profile Card
- Instagram

School Hub가 개인 명단의 상세 UI를 모두 대신하지 않는다.

---

## 6. SEO 관계

School Hub는 핵심 외부 랜딩이다.

- State A cold-start는 noindex 정책 적용
- 성장 후 index 승격 가능
- canonical/metadata/sitemap 규칙은 `10-seo.md`가 소유

---

## 7. 하지 않는 것

- 학교 소개문을 핵심 Hero로 사용
- 모든 State에 랭킹 노출
- State A에 결핍/실패 카피
- State D에서 공유를 Primary CTA로 변경
- 개인 이름을 활동 피드처럼 노출
- Level 공식을 화면에서 계산
