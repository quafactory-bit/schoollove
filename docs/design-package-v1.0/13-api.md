# SchoolLoveI API Contract v1.0

Status: **FROZEN**

> **PHASE 10A SAFETY OVERRIDE (2026-07-28):** 공개 API는 profile 행 또는 nickname·졸업연도·반·Instagram 조합을 반환하지 않는다. `POST /api/profiles`는 503과 안정적인 error code로 항상 차단하며, `anon`/`authenticated`의 profiles SELECT/INSERT/UPDATE/DELETE와 profile 기반 ranking RPC 실행 권한을 회수하는 신규 migration을 사용한다. 관리자 service-role 경계는 보존한다.

> **PHASE 10B APPROVED SUPERSESSION (2026-07-28):** 개인 API는 검증된 이메일 OTP session user ID만 사용하며 request body의 user ID를 신뢰하지 않는다. 성인 확인·필수 동의 뒤 owner-only private profile과 학교 이력만 생성·수정·삭제할 수 있고, 다른 사용자의 raw row는 반환하지 않는다.

## 0. 원칙

API는 제품 정책의 통로다.

API가 각자 새로운 제품 판단을 만들지 않는다.

Policy가 계산하고 API는 전달한다.

---

## 1. Response Convention

모든 P1 API 응답은 기본적으로 다음 형태를 따른다.

```ts
{
  data,
  error
}
```

성공:

```ts
{
  data: ..., 
  error: null
}
```

실패:

```ts
{
  data: null,
  error: ...
}
```

---

## 2. Shared Types

P1 공통 타입:

```text
LevelState
SchoolState
ProfileCard
FeedItem
Growth
```

### LevelState

`03-level-policy.md` 계약을 그대로 사용한다.

### SchoolState

```text
A | B | C | D
```

State 경계는 Policy가 소유한다.

### ProfileCard

Year/Class 명단에서 사용할 사람 카드 데이터.

핵심 필드:

```text
id
nickname
instagram_id
class context
```

### FeedItem

```ts
{
  type: "register" | "levelup" | "trace"
  school: ...
  context: ...
}
```

### Growth

Level/다음 Level/Completion 등 화면이 성장 상태를 렌더하는 데 필요한 통합 컨텍스트.

---

## 3. API Layer 원칙

`lib/api/*`를 공통 데이터 접근 계층으로 사용한다.

페이지에서 Supabase 직접 호출이 이미 존재하는 경우 P1 리팩터링에서 API 계층과 기준을 통일한다.

같은 query/validation을 페이지별로 복제하지 않는다.

---

## 4. Register API

책임:

- 입력 정규화
- 서버 validation
- duplicate 후보 확인
- 사용자 확인 상태 반영
- profile insert
- school update
- LevelState 재계산
- level persistence
- Feed event 생성 연결

Level 공식은 API에 넣지 않는다.

---

## 5. Search API

책임:

- 학교 검색
- relevance 기준 결과
- 등록 학교 tie-break context
- search log 생성
- result_count 기록
- 학교 클릭 시 `clicked_school_id` update

검색 쿼리를 URL에 노출하기 위한 API 구조를 만들지 않는다.

---

## 6. People Discovery API

- School / Year / Class 기준 `profiles` 필터
- hidden profile 제외
- Year 기수 집계
- Class 명단
- ProfileCard shape 반환
- Year 이름 검색 P1은 로드된 명단 클라이언트 필터

P1에서 독립 Profile API/page를 만들지 않는다.

---

## 7. Admin / Report API

- Instagram add/edit request
- delete request
- report create
- report_count / hidden 흐름
- Admin status 처리

정상 사용자 흐름과 관리자 권한 흐름을 구분한다.

---

## 8. Security

### Read

공개 읽기 데이터는 캐시 가능하다.

RLS/anon 권한은 서버 경계에서 올바르게 처리한다.

### Write

다음 write 행동은 rate limit 대상이다.

- register
- Instagram add/edit request
- report

Registration은 CAPTCHA를 적용한다.

서버측 validation을 클라이언트 validation으로 대체하지 않는다.

Upstash rate limit 구조를 사용한다.

---

## 9. Cache

- 공개 School/Year/Class read는 캐시 가능
- 집계 context는 캐시 가능
- 사용자 write 결과는 즉시 Growth 재계산에 반영
- SEO freshness와 Level 갱신 시점이 장기간 stale 되지 않도록 한다

대형 학교 캐싱 고도화는 P2.

---

## 10. 하지 않는 것

- API route별 Level 공식
- page별 Supabase query 중복 확장
- 신규 P1 데이터 모델 임의 추가
- 독립 Profile API/page
- P2 인기 검색 API
- 클라이언트만 믿는 write validation
